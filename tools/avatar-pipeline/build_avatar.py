import bpy, bmesh, numpy as np, json, math, sys, os
from mathutils import Vector
from scipy.spatial import cKDTree
from scipy import ndimage

SRC = sys.argv[-2]
OUT = sys.argv[-1]
WD = '/home/claude/work/'
meta = json.load(open(WD + 'atlas_meta.json'))
P = np.load(WD + 'planar.npz')
X0, Z1, S = float(P['X0']), float(P['Z1']), float(P['S'])
MIRX = meta['mirrorX']

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ico = bpy.data.objects.get('Icosphere')
if ico:
    bpy.data.objects.remove(ico, do_unlink=True)
arm = bpy.data.objects['target_character']
body = bpy.data.objects['output_unwrapped']

# ---------- textures ----------
mat = body.material_slots[0].material
for n in mat.node_tree.nodes:
    if n.type == 'TEX_IMAGE' and n.image:
        nm = n.image.name
        if nm.startswith('texture_0') and 'metallic' not in nm:
            new = bpy.data.images.load(WD + 'texture_clean.png'); new.colorspace_settings.name = 'sRGB'; new.pack(); n.image = new
        elif 'metallic' in nm:
            n.image.scale(1024, 1024)
print('textures ok')

# ---------- smooth face depth ----------
D = P['depth'].copy(); A = P['alpha']
valid = (A > 0) & (D < 1e8)
idx = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
D = D[idx[0], idx[1]]
Dmin = ndimage.minimum_filter(D, size=25)
Ds = np.minimum(ndimage.gaussian_filter(Dmin, 8), ndimage.minimum_filter(D, size=9))

def samp(px, py):
    return ndimage.map_coordinates(Ds, [np.atleast_1d(py), np.atleast_1d(px)], order=1, mode='nearest')

# ---------- skin-weight source ----------
me = body.data
V = np.array([v.co[:] for v in me.vertices])
names = [g.name for g in body.vertex_groups]
Wt = np.zeros((len(V), len(names)), np.float32)
for v in me.vertices:
    for g in v.groups:
        Wt[v.index, g.group] = g.weight
tree = cKDTree(V)

def make_material(name, atlas_file, roughness, mr_file=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0.0
    tex = nt.nodes.new('ShaderNodeTexImage')
    img = bpy.data.images.load(WD + atlas_file, check_existing=True)
    img.colorspace_settings.name = 'sRGB'; img.alpha_mode = 'STRAIGHT'
    if not img.packed_file: img.pack()
    tex.image = img; tex.interpolation = 'Linear'; tex.extension = 'EXTEND'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if mr_file:
        mr = nt.nodes.new('ShaderNodeTexImage')
        mimg = bpy.data.images.load(WD + mr_file, check_existing=True); mimg.colorspace_settings.name = 'Non-Color'
        if not mimg.packed_file: mimg.pack()
        mr.image = mimg; mr.interpolation = 'Linear'; mr.extension = 'EXTEND'
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(mr.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    try:
        m.surface_render_method = 'BLENDED'
    except Exception:
        pass
    try:
        m.blend_method = 'BLEND'
    except Exception:
        pass
    try:
        m.use_backface_culling = True
    except Exception:
        pass
    return m

def make_patch(name, info, rect, mirror, nx, ny, offset, mat_, dcell=(0, 0)):
    rx0, ry0, rw, rh = rect
    if mirror:
        rx0 = 2 * MIRX - (rx0 + rw)
    cw, ch = info['cell']; aw, ah = cw * info['cols'], ch * info['rows']
    px = rx0 + np.linspace(0, rw, nx + 1); py = ry0 + np.linspace(0, rh, ny + 1)
    PX, PY = np.meshgrid(px, py)
    d = samp(PX.ravel(), PY.ravel()).reshape(PX.shape)
    e = 10.0
    fx = (samp((PX + e).ravel(), PY.ravel()) - samp((PX - e).ravel(), PY.ravel())).reshape(PX.shape) / (2 * e / S)
    fz = (samp(PX.ravel(), (PY - e).ravel()) - samp(PX.ravel(), (PY + e).ravel())).reshape(PX.shape) / (2 * e / S)
    nrm = np.stack([fx, -np.ones_like(fx), fz], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    pos = np.stack([X0 + PX / S, d, Z1 - PY / S], -1) + nrm * offset
    verts = [tuple(p) for p in pos.reshape(-1, 3)]
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(verts, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if np.mean([f.normal.y for f in bm.faces]) > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    uv = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for l in f.loops:
            k = l.vert.index
            j, i = divmod(k, nx + 1)
            ul = i / nx
            if mirror: ul = 1 - ul
            u = (dcell[0] * cw + ul * cw) / aw
            v = 1 - (dcell[1] * ch + (j / ny) * ch) / ah
            l[uv].uv = (u, v)
    bm.to_mesh(mesh); bm.free()
    for p in mesh.polygons: p.use_smooth = True
    obj.data.materials.append(mat_)
    # weights
    _, nn = tree.query(pos.reshape(-1, 3))
    groups = {}
    for gi, gname in enumerate(names):
        groups[gname] = obj.vertex_groups.new(name=gname)
    for k, src in enumerate(nn):
        for gi in np.nonzero(Wt[src] > 0.001)[0]:
            groups[names[gi]].add([k], float(Wt[src, gi]), 'REPLACE')
    obj.parent = arm
    mod = obj.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    return obj

mE = make_material('Mat_Eyes', 'eyes_atlas.png', 0.28, 'eyes_mr.png')
mB = make_material('Mat_Brows', 'brows_atlas.png', 0.85)
mM = make_material('Mat_Mouth', 'mouth_atlas.png', 0.5)
mEL = mE; mER = mE.copy(); mER.name = 'Mat_Eyes_R'
mBL = mB; mBR = mB.copy(); mBR.name = 'Mat_Brows_R'
mE.name = 'Mat_Eyes_L'; mB.name = 'Mat_Brows_L'
for m_ in (mER, mBR):
    pass

ei, bi, mi = meta['eyes'], meta['brows'], meta['mouth']
make_patch('Face_EyeL', ei, ei['rectL'], False, 32, 26, 0.0012, mEL, (0, 4))
make_patch('Face_EyeR', ei, ei['rectL'], True, 32, 26, 0.0012, mER, (0, 4))
make_patch('Face_BrowL', bi, bi['rectL'], False, 36, 20, 0.0016, mBL)
make_patch('Face_BrowR', bi, bi['rectL'], True, 36, 20, 0.0016, mBR)
make_patch('Face_Mouth', mi, mi['rectL'], False, 44, 20, 0.0012, mM)
print('patches ok')

# ---------- ear bones ----------
head_i = names.index('mixamorig:Head')
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.data.edit_bones
hb = eb['mixamorig:Head']
ear_info = {}
for side, sg in (('L', 1), ('R', -1)):
    sel = (Wt[:, head_i] > 0.5) & (V[:, 2] > 1.43) & (sg * V[:, 0] > 0.15)
    Pp = V[sel]; c = Pp.mean(0)
    u_, s_, vt = np.linalg.svd(Pp - c, full_matrices=False)
    ax = vt[0] * np.sign(vt[0][2]); ax /= np.linalg.norm(ax)
    t = (Pp - c) @ ax
    tR, tT = np.percentile(t, 1), np.percentile(t, 99.5)
    R = c + ax * tR; T = c + ax * tT
    pts = [R, R + (T - R) / 3, R + 2 * (T - R) / 3, T]
    prev = hb
    for k in range(3):
        b = eb.new(f'Ear_{side}_{k + 1}')
        b.head = Vector(pts[k]); b.tail = Vector(pts[k + 1]); b.parent = prev
        b.use_connect = (k > 0); b.use_deform = True
        prev = b
    ear_info[side] = dict(c=c, ax=ax, tR=tR, tT=tT, sg=sg)
bpy.ops.object.mode_set(mode='OBJECT')

bvg = {n: body.vertex_groups.new(name=n) for n in [f'Ear_{s}_{k}' for s in 'LR' for k in (1, 2, 3)]}
headvg = body.vertex_groups['mixamorig:Head']
def tri(u, a, b, c):
    return max(0.0, min((u - a) / (b - a), (c - u) / (c - b)))
cnt = 0
for side, inf in ear_info.items():
    sg = inf['sg']
    reg = np.nonzero((V[:, 2] > 1.40) & (sg * V[:, 0] > 0.12))[0]
    for vi in reg:
        wh = Wt[vi, head_i]
        if wh < 0.01: continue
        t = (V[vi] - inf['c']) @ inf['ax']
        u = (t - inf['tR']) / (inf['tT'] - inf['tR']); u = min(max(u, 0.0), 1.0)
        fH = min(max((0.30 - u) / 0.20, 0), 1)
        f1 = tri(u, 0.10, 0.30, 0.60); f2 = tri(u, 0.30, 0.60, 0.95); f3 = min(max((u - 0.60) / 0.35, 0), 1)
        headvg.add([int(vi)], float(wh * fH), 'REPLACE')
        for k, f in ((1, f1), (2, f2), (3, f3)):
            if f > 0.001: bvg[f'Ear_{side}_{k}'].add([int(vi)], float(wh * f), 'REPLACE')
        cnt += 1
print('ear verts', cnt)

print('actions', [a.name for a in bpy.data.actions])
for b in ('Ear_L_1', 'Ear_L_2', 'Ear_R_1'):
    bb = arm.data.bones[b]; print(b, [tuple(round(x, 2) for x in r) for r in bb.matrix_local.to_3x3().transposed()])

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
                          export_skins=True, export_image_format='AUTO', export_apply=False, export_yup=True,
                          export_normals=True, export_texcoords=True, export_materials='EXPORT')
print('exported', OUT, os.path.getsize(OUT))
