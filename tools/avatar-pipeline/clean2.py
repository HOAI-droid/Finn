import numpy as np, cv2
d=np.load('planar.npz'); img=d['img'].astype(np.float32); alpha=d['alpha']
H,W=img.shape[:2]
def ell(m,cx,ay,ax,ayy,ang=0): cv2.ellipse(m,(int(cx),int(ay)),(int(ax),int(ayy)),ang,0,360,255,-1)
rough=np.zeros((H,W),np.uint8)
ell(rough,885,1560,420,350); ell(rough,2115,1560,420,350)
for (x0,y0,x1,y1) in [(480,930,1250,1200),(1750,925,2520,1190)]: cv2.rectangle(rough,(x0,y0),(x1,y1),255,-1)
cv2.rectangle(rough,(1000,2125),(2000,2300),255,-1)
def lowfill(img,mask,scale=8):
    sm=cv2.resize(img,(W//scale,H//scale),interpolation=cv2.INTER_AREA).astype(np.uint8)
    mm=cv2.resize(mask,(W//scale,H//scale),interpolation=cv2.INTER_NEAREST)
    f=cv2.inpaint(sm,mm,9,cv2.INPAINT_TELEA); f=cv2.GaussianBlur(f,(0,0),1.5)
    return cv2.resize(f,(W,H),interpolation=cv2.INTER_CUBIC).astype(np.float32)
lf=lowfill(img,rough)
# fur detail from forehead
ref=img[600:900,1200:1680]
hp=ref-cv2.GaussianBlur(ref,(0,0),10)
hp2=np.concatenate([hp,hp[:,::-1]],1); hp2=np.concatenate([hp2,hp2[::-1]],0)
reps=(H//hp2.shape[0]+1,W//hp2.shape[1]+1,1); big=np.tile(hp2,reps)[:H,:W]
fill=lf+big*0.9
# exact feature mask = difference vs fill, inside rough
diff=np.sqrt(((img-lf)**2).sum(2))
feat=((diff>28)&(rough>0)).astype(np.uint8)*255
feat=cv2.morphologyEx(feat,cv2.MORPH_CLOSE,np.ones((15,15),np.uint8))
feat=cv2.dilate(feat,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(41,41)))
# fill holes
cnts,_=cv2.findContours(feat,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
feat2=np.zeros_like(feat); cv2.drawContours(feat2,cnts,-1,255,-1)
# keep nose safe: remove region around nose
cv2.rectangle(feat2,(1330,1850),(1680,2110),0,-1)
cv2.rectangle(feat2,(1090,2120),(1910,2310),255,-1)
soft=cv2.GaussianBlur(feat2,(0,0),14).astype(np.float32)[...,None]/255
clean=img*(1-soft)+fill*soft
np.save('feat_mask.npy',feat2)
cv2.imwrite('clean.png',np.clip(clean,0,255).astype(np.uint8)[:,:,::-1])
cv2.imwrite('clean_small.png',cv2.resize(np.clip(clean,0,255).astype(np.uint8)[:,:,::-1],(1000,1000),interpolation=cv2.INTER_AREA))
cv2.imwrite('featmask_small.png',cv2.resize(feat2,(1000,1000)))
