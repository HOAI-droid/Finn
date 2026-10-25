import numpy as np, cv2, cairo, json, math
clean = cv2.imread('clean.png')[:, :, ::-1].copy()
img = cv2.imread('planar.png')[:, :, ::-1].copy()
E = json.load(open('eyes.json'))
mask = np.load('eye_mask_L.npy')
L = E['L']

def surf_from_rgb(rgb):
    h, w = rgb.shape[:2]
    bgra = np.dstack([rgb[:, :, 2], rgb[:, :, 1], rgb[:, :, 0], np.full((h, w), 255, np.uint8)]).copy()
    return cairo.ImageSurface.create_for_data(bytearray(bgra.tobytes()), cairo.FORMAT_ARGB32, w, h), bgra

def surf_to_rgba(s, w, h, outw, outh):
    a = np.frombuffer(s.get_data(), np.uint8).reshape(h, w, 4).astype(np.float32)  # BGRA premult
    a = cv2.resize(a, (outw, outh), interpolation=cv2.INTER_AREA)
    al = a[:, :, 3:4]
    rgb = np.where(al > 0.5, a[:, :, :3] / np.maximum(al, 1) * 255, 0)
    out = np.dstack([rgb[:, :, 2], rgb[:, :, 1], rgb[:, :, 0], al[:, :, 0]])
    return np.clip(out, 0, 255).astype(np.uint8)

def smooth(a, k=21):
    p = k // 2
    ap = np.pad(a, p, mode='edge')
    return np.convolve(ap, np.ones(k) / k, mode='valid')

# ---------------- EYES ----------------
EX0, EY0, EW, EH = 486, 1231, 800, 640   # planar rect for left eye
ESC = 0.4
CW, CH = int(EW * ESC), int(EH * ESC)    # 320 x 256
ys_, xs_ = np.nonzero(mask)
xmin, xmax = xs_.min(), xs_.max()
top = np.zeros(xmax - xmin + 1); bot = np.zeros_like(top)
for i, x in enumerate(range(xmin, xmax + 1)):
    col = np.nonzero(mask[:, x])[0]
    top[i] = col.min(); bot[i] = col.max()
top = smooth(top, 25); bot = smooth(bot, 25)
xs = np.arange(xmin, xmax + 1).astype(float)
S = (xs - xmin) / (xmax - xmin)
cnt = np.array(L['contour'], np.float64)
dil = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (61, 61)))
dcnts, _ = cv2.findContours(dil, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
dcnt = max(dcnts, key=cv2.contourArea)[:, 0, :].astype(np.float64)
sm = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
scnts, _ = cv2.findContours(sm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
scnt = max(scnts, key=cv2.contourArea)[:, 0, :].astype(np.float64)
ix0, iy0, ir = L['iris']; px0, py0, pr = L['pupil']
skin_rgb = clean[EY0:EY0 + EH, EX0:EX0 + EW]
skin_surf, _keep = surf_from_rgb(skin_rgb)
OUT = (46, 30, 36)

EYE_STATES = {
    #           tu_outer tu_inner tl_outer tl_inner pupil iris
    'open':      (0, 0, 0, 0, 1.0, 1.0),
    'half':      (.42, .42, .0, .0, 1.0, 1.0),
    'blink':     (.72, .72, .06, .06, 1.0, 1.0),
    'closed':    (.93, .93, .0, .0, 1.0, 1.0),
    'happy':     (.04, .04, .42, .42, 1.0, 1.0),
    'sad':       (.55, .0, .0, .0, 1.0, 1.0),
    'angry':     (.0, .55, .0, .0, 1.0, 1.0),
    'sleepy':    (.55, .55, .12, .12, 1.0, 1.0),
    'surprised': (0, 0, 0, 0, .76, .93),
}
GAZE_DX, GAZE_DY = 85, 45

def path_poly(ctx, pts):
    ctx.move_to(*pts[0])
    for p in pts[1:]: ctx.line_to(*p)
    ctx.close_path()

def draw_eye(state, gx, gy, maskmode=False):
    tuo, tui, tlo, tli, ps, isc = EYE_STATES[state]
    W_, H_ = EW, EH
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, W_, H_)
    c = cairo.Context(s)
    c.set_antialias(cairo.ANTIALIAS_BEST)
    c.translate(-EX0, -EY0)
    tu = tuo * (1 - S) + tui * S
    tl = tlo * (1 - S) + tli * S
    yedge = top + tu * (bot - top)
    ylow = bot - tl * (bot - top)
    # sclera
    c.save(); path_poly(c, cnt); c.clip()
    if maskmode:
        c.set_source_rgb(0, 0, 0); c.paint()
        c.new_path()
    c.set_source_rgb(.98, .975, .965)
    if not maskmode: c.paint()
    if not maskmode:
        g = cairo.LinearGradient(0, top.min(), 0, bot.max())
        g.add_color_stop_rgba(0, .72, .76, .86, .65); g.add_color_stop_rgba(.34, .8, .84, .92, .0)
        g.add_color_stop_rgba(1, .96, .88, .86, .25)
        c.set_source(g); c.paint()
        # iris
        dx, dy = gx * GAZE_DX, gy * GAZE_DY
        ix, iy = ix0 + dx, iy0 + dy
        r_i = ir * isc
        rg = cairo.RadialGradient(ix, iy, r_i * .74, ix, iy, r_i)
        rg.add_color_stop_rgb(0, .15, .66, .92); rg.add_color_stop_rgb(.45, .07, .43, .83)
        rg.add_color_stop_rgb(.88, .03, .22, .55); rg.add_color_stop_rgb(1, .02, .1, .28)
        c.arc(ix, iy, r_i, 0, 2 * math.pi); c.set_source(rg); c.fill()
        c.save(); c.arc(ix, iy, r_i, 0, 2 * math.pi); c.clip()
        lg = cairo.LinearGradient(0, iy - r_i, 0, iy + r_i)
        lg.add_color_stop_rgba(0, 0, .05, .2, .5); lg.add_color_stop_rgba(.5, 0, 0, 0, 0)
        lg.add_color_stop_rgba(1, .45, .95, 1, .55)
        c.set_source(lg); c.paint(); c.restore()
        # pupil
        pcx, pcy, prr = px0 + dx, py0 + dy - (1 - ps) * 6, pr * ps
        c.arc(pcx, pcy, prr, 0, 2 * math.pi); c.set_source_rgb(.045, .045, .055); c.fill()
        c.save(); c.arc(pcx, pcy, prr, 0, 2 * math.pi); c.clip()
        bg = cairo.LinearGradient(0, pcy - prr, 0, pcy + prr)
        bg.add_color_stop_rgba(0, .3, .17, .1, 0); bg.add_color_stop_rgba(.68, .3, .17, .1, 0); bg.add_color_stop_rgba(1, .36, .2, .12, .7)
        c.set_source(bg); c.paint(); c.restore()
        # highlights
        c.set_source_rgba(1, 1, 1, .96); c.save(); c.translate(ix - .30 * r_i, iy - .36 * r_i); c.scale(1, .92)
        c.arc(0, 0, .16 * r_i, 0, 2 * math.pi); c.fill(); c.restore()
        c.set_source_rgba(1, 1, 1, .8); c.arc(ix + .30 * r_i, iy + .32 * r_i, .075 * r_i, 0, 2 * math.pi); c.fill()
    c.restore()  # end almond clip
    # lid cover (skin)
    for upper in (True, False):
        pts = []
        if upper:
            pts = [(x, t - 80) for x, t in zip(xs, top)] + [(x, e) for x, e in zip(xs[::-1], yedge[::-1])]
        else:
            pts = [(x, e) for x, e in zip(xs, ylow)] + [(x, b + 80) for x, b in zip(xs[::-1], bot[::-1])]
        c.save(); path_poly(c, scnt); c.clip(); path_poly(c, pts); c.clip()
        if maskmode: c.set_source_rgb(1, 1, 1); c.paint()
        else: c.set_source_surface(skin_surf, EX0, EY0); c.paint()
        c.restore()
    # lid strokes with dilated clip
    c.save(); path_poly(c, dcnt); c.clip()
    c.set_source_rgb(*([0.5, 0.5, 0.5] if maskmode else [v / 255 for v in OUT]))
    wtop = 8 + 30 * np.sin(np.pi * np.clip(S, 0, 1)) ** .7
    pts = [(x, e) for x, e in zip(xs, yedge)] + [(x, e + w) for x, e, w in zip(xs[::-1], yedge[::-1], wtop[::-1])]
    path_poly(c, pts); c.fill()
    wlow = 3 + 10 * np.sin(np.pi * np.clip(S, 0, 1)) ** .7
    pts = [(x, e - w) for x, e, w in zip(xs, ylow, wlow)] + [(x, e) for x, e in zip(xs[::-1], ylow[::-1])]
    path_poly(c, pts); c.fill()
    c.restore()
    s.flush()
    r = surf_to_rgba(s, W_, H_, CW, CH)
    return r

def build_eyes():
    states = list(EYE_STATES)
    cols, rows = len(states), 9
    atlas = np.zeros((rows * CH, cols * CW, 4), np.uint8)
    mr = np.zeros((rows * CH, cols * CW, 3), np.uint8)
    for si, st in enumerate(states):
        for gi in range(9):
            gx, gy = gi % 3 - 1, gi // 3 - 1
            cell = draw_eye(st, gx, gy)
            atlas[gi * CH:(gi + 1) * CH, si * CW:(si + 1) * CW] = cell
            m = draw_eye(st, gx, gy, True)
            v = m[:, :, 2].astype(np.float32) / 255  # white=skin, gray=stroke (premult over black)
            rough = 0.22 + (0.92 - 0.22) * np.clip(v * 2 - 1, 0, 1) + (0.62 - 0.22) * np.clip(1 - abs(v * 2 - 1), 0, 1) * (m[:, :, 3] > 0)
            rough = np.where(m[:, :, 3] > 0, rough, 0.5)
            mr[gi * CH:(gi + 1) * CH, si * CW:(si + 1) * CW] = np.dstack([np.full_like(rough, 255), rough * 255, np.zeros_like(rough)]).astype(np.uint8)
    cv2.imwrite('eyes_mr.png', mr[:, :, ::-1])
    cv2.imwrite('eyes_atlas.png', atlas[:, :, [2, 1, 0, 3]])
    return dict(file='eyes_atlas.png', cell=[CW, CH], cols=cols, rows=rows, states=states,
                rectL=[EX0, EY0, EW, EH], gazeUnit=[GAZE_DX, GAZE_DY])

# ---------------- BROWS ----------------
BX0, BY0, BW, BH = 400, 790, 940, 520
BSC = 0.5
def build_brows():
    box = (480, 930, 1250, 1200)
    x0, y0, x1, y1 = box
    ref = clean[y0:y1, x0:x1].astype(np.float32); cur = img[y0:y1, x0:x1].astype(np.float32)
    lum = lambda a: 0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]
    lc, li = lum(ref), lum(cur)
    dark = np.percentile(li, 2)
    a = np.clip((lc - li) / np.maximum(lc - dark, 1) * 1.15, 0, 1)
    a[a < 0.06] = 0
    a = cv2.GaussianBlur(a, (0, 0), 1.2)
    # foreground colour estimate
    core = cur[a > .85].mean(0)
    wgt = np.clip((a - .8) / .15, 0, 1)[..., None]
    F = core * (1 - wgt) + cur * wgt
    F = np.clip(F, 0, 255)
    full_a = np.zeros((BH, BW), np.float32); full_F = np.zeros((BH, BW, 3), np.float32)
    ox, oy = x0 - BX0, y0 - BY0
    full_a[oy:oy + a.shape[0], ox:ox + a.shape[1]] = a
    full_F[oy:oy + a.shape[0], ox:ox + a.shape[1]] = F
    ys, xs = np.nonzero(full_a > .5)
    cx, cy = xs.mean(), ys.mean()
    states = {'neutral': (0, 0, 1), 'up': (0, -75, 1), 'high': (0, -140, 1.1), 'down': (0, 50, 1),
             'angry': (-18, 32, 1), 'sad': (18, -34, 1), 'worried': (14, -90, 1), 'skeptic': (-9, -85, 1)}
    names = list(states)
    cw, ch = int(BW * BSC), int(BH * BSC)
    cols = 4; rows = 2
    atlas = np.zeros((rows * ch, cols * cw, 4), np.uint8)
    for i, n in enumerate(names):
        ang, dy, sy = states[n]
        M = cv2.getRotationMatrix2D((cx, cy), ang, 1.0)
        M[1, 1] *= sy; M[1, 2] += dy + (1 - sy) * cy
        pre = np.dstack([full_F * full_a[..., None], full_a])
        w = cv2.warpAffine(pre, M, (BW, BH), flags=cv2.INTER_CUBIC)
        w = cv2.resize(w, (cw, ch), interpolation=cv2.INTER_AREA)
        al = np.clip(w[..., 3:4], 0, 1)
        rgb = np.where(al > .02, w[..., :3] / np.maximum(al, .02), 0)
        cell = np.dstack([rgb, al * 255])
        r_, c_ = divmod(i, cols)
        atlas[r_ * ch:(r_ + 1) * ch, c_ * cw:(c_ + 1) * cw] = np.clip(cell, 0, 255).astype(np.uint8)
    cv2.imwrite('brows_atlas.png', atlas[:, :, [2, 1, 0, 3]])
    return dict(file='brows_atlas.png', cell=[cw, ch], cols=cols, rows=rows, states=names, rectL=[BX0, BY0, BW, BH])

# ---------------- MOUTH ----------------
MX0, MY0, MW, MH = 947.5, 2090, 1105, 483
MCW, MCH = 512, 224
CX, Y0 = 1500.0, 2215.0
MOUTH = {
    #      hw   corner  yt   yb   teeth tongue round
    'sil':   (385, -45, 14, 24, 0, 0, 0),
    'PP':    (335, -16, 8, 14, 0, 0, 0),
    'FF':    (345, -22, -6, 78, 58, 0, 0),
    'TH':    (300, -16, -14, 98, 46, .38, 0),
    'DD':    (320, -22, -12, 108, 56, .42, 0),
    'kk':    (310, -12, -10, 150, 42, .7, 0),
    'CH':    (215, -4, -26, 112, 34, .2, 1),
    'SS':    (365, -32, -10, 70, 72, 0, 0),
    'nn':    (320, -22, -8, 92, 50, .3, 0),
    'RR':    (240, -6, -22, 118, 40, .3, 1),
    'aa':    (330, -26, -18, 270, 62, .85, 0),
    'E':     (360, -36, -10, 152, 66, .45, 0),
    'I':     (360, -42, -8, 102, 68, .25, 0),
    'O':     (190, 4, -40, 232, 0, .5, 1),
    'U':     (150, 8, -26, 150, 0, .2, 1),
    'smile': (400, -78, -20, 192, 72, .7, 0),
    'laugh': (410, -92, -26, 292, 74, .92, 0),
    'frown': (330, 72, 0, 10, 0, 0, 0),
    'surprised': (150, 5, -46, 252, 0, .4, 1),
}
MAROON = (.33, .14, .19)

def qpts(p0, c, p2, n=40):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 2 * p0 + 2 * (1 - t) * t * c + t ** 2 * p2

def draw_mouth(name):
    hw, cor, yt, yb, th, tg, rnd = MOUTH[name]
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, int(MW), int(MH))
    c = cairo.Context(s); c.set_antialias(cairo.ANTIALIAS_BEST)
    c.translate(-MX0, -MY0)
    yc = Y0 + cor
    pl = np.array([CX - hw, yc]); pr_ = np.array([CX + hw, yc])
    gap = yb - yt
    if gap < 26 and not rnd:
        ym = Y0 + (yt + yb) / 2
        ctl = np.array([CX, 2 * ym - yc])
        pts = qpts(pl, ctl, pr_)
        c.set_line_cap(cairo.LINE_CAP_ROUND); c.set_line_join(cairo.LINE_JOIN_ROUND)
        c.move_to(*pts[0])
        for p in pts[1:]: c.line_to(*p)
        c.set_source_rgb(*MAROON); c.set_line_width(13); c.stroke()
        # soft cheek dimples at corners
        for sx in (-1, 1):
            cx_, cy_ = CX + sx * (hw + 8), yc - 6
            c.save(); c.translate(cx_, cy_); c.rotate(sx * .5)
            c.arc(0, 0, 16, -1.2, 1.2) if sx > 0 else c.arc(0, 0, 16, math.pi - 1.2, math.pi + 1.2)
            c.set_line_width(7); c.stroke(); c.restore()
        s.flush(); return surf_to_rgba(s, int(MW), int(MH), MCW, MCH)
    ytop, ybot = Y0 + yt, Y0 + yb
    if rnd:
        cyy = (ytop + ybot) / 2
        def shape(cc):
            cc.save(); cc.translate(CX, cyy); cc.scale(hw, (ybot - ytop) / 2); cc.arc(0, 0, 1, 0, 2 * math.pi); cc.restore()
        top_curve = None
    else:
        tc = np.array([CX, 2 * ytop - yc]); bc = np.array([CX, 2 * ybot - yc])
        top_curve = qpts(pl, tc, pr_); bot_curve = qpts(pr_, bc, pl)
        def shape(cc):
            cc.move_to(*top_curve[0])
            for p in top_curve[1:]: cc.line_to(*p)
            for p in bot_curve[1:]: cc.line_to(*p)
            cc.close_path()
    c.save(); shape(c); c.clip()
    g = cairo.LinearGradient(0, ytop, 0, ybot)
    g.add_color_stop_rgb(0, .2, .06, .1); g.add_color_stop_rgb(.55, .36, .1, .16); g.add_color_stop_rgb(1, .55, .17, .24)
    c.set_source(g); c.paint()
    if tg > 0:
        h = ybot - ytop; ry = tg * h * .52; rx = (hw * .64) * (0.75 if rnd else 1)
        c.save(); c.translate(CX, ybot + ry * .12); c.scale(rx, ry)
        tgr = cairo.RadialGradient(0, -.3, .1, 0, 0, 1)
        tgr.add_color_stop_rgb(0, .97, .55, .60); tgr.add_color_stop_rgb(1, .85, .36, .44)
        c.arc(0, 0, 1, 0, 2 * math.pi); c.set_source(tgr); c.fill(); c.restore()
        c.set_source_rgba(.6, .2, .28, .55); c.set_line_width(5)
        c.move_to(CX, ybot - ry * .85); c.line_to(CX, ybot - ry * .25); c.stroke()
    if th > 0:
        if top_curve is not None:
            sel = np.abs(top_curve[:, 0] - CX) < hw * .82
            tp = top_curve[sel]
            poly = [tuple(p) for p in tp] + [(p[0], p[1] + th) for p in tp[::-1]]
        else:
            poly = [(CX - hw * .7, ytop - 5), (CX + hw * .7, ytop - 5), (CX + hw * .6, ytop + th), (CX - hw * .6, ytop + th)]
        path_poly(c, poly)
        tgd = cairo.LinearGradient(0, ytop, 0, ytop + th)
        tgd.add_color_stop_rgb(0, 1, 1, .98); tgd.add_color_stop_rgb(.8, .98, .96, .92); tgd.add_color_stop_rgb(1, .86, .82, .8)
        c.set_source(tgd); c.fill_preserve(); c.set_source_rgba(.5, .3, .3, .5); c.set_line_width(3); c.stroke()
    c.restore()
    c.set_line_join(cairo.LINE_JOIN_ROUND); c.set_line_cap(cairo.LINE_CAP_ROUND)
    shape(c); c.set_source_rgb(*MAROON); c.set_line_width(14); c.stroke()
    s.flush()
    return surf_to_rgba(s, int(MW), int(MH), MCW, MCH)

def build_mouth():
    names = list(MOUTH); cols = 5; rows = math.ceil(len(names) / cols)
    atlas = np.zeros((rows * MCH, cols * MCW, 4), np.uint8)
    for i, n in enumerate(names):
        r_, c_ = divmod(i, cols)
        atlas[r_ * MCH:(r_ + 1) * MCH, c_ * MCW:(c_ + 1) * MCW] = draw_mouth(n)
    cv2.imwrite('mouth_atlas.png', atlas[:, :, [2, 1, 0, 3]])
    return dict(file='mouth_atlas.png', cell=[MCW, MCH], cols=cols, rows=rows, states=names, rectL=[MX0, MY0, MW, MH])

if __name__ == '__main__':
    meta = dict(eyes=build_eyes(), brows=build_brows(), mouth=build_mouth(), mirrorX=1500.0)
    meta['eyes']['default'] = [0, 4]; meta['brows']['default'] = [0, 0]; meta['mouth']['default'] = [0, 0]
    json.dump(meta, open('atlas_meta.json', 'w'), indent=1)
    print(json.dumps({k: (v['cell'], v['cols'], v['rows']) for k, v in meta.items() if isinstance(v, dict)}))
