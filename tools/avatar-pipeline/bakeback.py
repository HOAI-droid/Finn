import numpy as np, cv2
d=np.load('planar.npz'); uv=d['uvpix']; alpha=d['alpha']
img=cv2.imread('planar.png')[:,:,::-1].astype(np.float32)
clean=cv2.imread('clean.png')[:,:,::-1].astype(np.float32)
tex=cv2.imread('texture_0.png')[:,:,::-1].copy()
Ht,Wt=tex.shape[:2]
chg=(np.abs(clean-img).max(2)>2)&(alpha>0)
chg=cv2.dilate(chg.astype(np.uint8),np.ones((5,5),np.uint8))>0
chg&=alpha>0
ys,xs=np.nonzero(chg)
u=np.rint(uv[ys,xs,0]).astype(int); v=np.rint(uv[ys,xs,1]).astype(int)
ok=(u>=0)&(u<Wt)&(v>=0)&(v<Ht); ys,xs,u,v=ys[ok],xs[ok],u[ok],v[ok]
acc=np.zeros((Ht,Wt,3),np.float64); cnt=np.zeros((Ht,Wt),np.float64)
np.add.at(acc,(v,u),clean[ys,xs]); np.add.at(cnt,(v,u),1)
hit=cnt>0
new=tex.astype(np.float32).copy(); new[hit]=(acc[hit]/cnt[hit,None])
# footprint dilation + fill gaps
foot=cv2.dilate(hit.astype(np.uint8),cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7)))>0
gap=(foot&~hit).astype(np.uint8)*255
filled=cv2.inpaint(np.clip(new,0,255).astype(np.uint8),gap,3,cv2.INPAINT_TELEA)
out=np.clip(new,0,255).astype(np.uint8); out[gap>0]=filled[gap>0]
cv2.imwrite('texture_clean.png',out[:,:,::-1])
print('texels changed',hit.sum(),'gap',(gap>0).sum())
# debug crop of atlas where changed
ys2,xs2=np.nonzero(foot); print(ys2.min(),ys2.max(),xs2.min(),xs2.max())
