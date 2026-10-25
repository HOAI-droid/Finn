import numpy as np, cv2
d=np.load('mesh.npz'); V=d['V'];T=d['T'];TUV=d['TUV'];N=d['N']
tex=cv2.imread('texture_0.png')[:,:,::-1].astype(np.float32)  # RGB
H,Wt=tex.shape[:2]
# face region (world): x,z window
X0,X1,Z0,Z1=-0.25,0.25,1.00,1.50
S=6000  # px per metre
w=int((X1-X0)*S); h=int((Z1-Z0)*S)
img=np.zeros((h,w,3),np.float32); depth=np.full((h,w),1e9,np.float32); alpha=np.zeros((h,w),np.uint8); uvpix=np.zeros((h,w,2),np.float32)
tid=np.full((h,w),-1,np.int32)
P=V[T] # (nt,3,3)
# keep triangles facing -Y and inside window
nrm=np.cross(P[:,1]-P[:,0],P[:,2]-P[:,0])
sel=np.where((nrm[:,1]<0)&(P[:,:,2].max(1)>Z0)&(P[:,:,2].min(1)<Z1)&(P[:,:,0].max(1)>X0)&(P[:,:,0].min(1)<X1)&(P[:,:,1].min(1)<0.0))[0]
print('tris',len(sel))
for t in sel:
    p=P[t]; px=(p[:,0]-X0)*S; py=(Z1-p[:,2])*S
    x0=int(max(np.floor(px.min()),0)); x1=int(min(np.ceil(px.max()),w-1))
    y0=int(max(np.floor(py.min()),0)); y1=int(min(np.ceil(py.max()),h-1))
    if x1<x0 or y1<y0: continue
    gx,gy=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
    a=np.array([px[0],py[0]]);b=np.array([px[1],py[1]]);c=np.array([px[2],py[2]])
    den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    if abs(den)<1e-9: continue
    l0=((b[1]-c[1])*(gx-c[0])+(c[0]-b[0])*(gy-c[1]))/den
    l1=((c[1]-a[1])*(gx-c[0])+(a[0]-c[0])*(gy-c[1]))/den
    l2=1-l0-l1
    m=(l0>=-1e-4)&(l1>=-1e-4)&(l2>=-1e-4)
    if not m.any(): continue
    dep=l0*p[0,1]+l1*p[1,1]+l2*p[2,1]   # y: smaller = closer to camera at -Y
    sub=depth[y0:y1+1,x0:x1+1]
    upd=m&(dep<sub)
    if not upd.any(): continue
    sub[upd]=dep[upd]
    uv=l0[...,None]*TUV[t,0]+l1[...,None]*TUV[t,1]+l2[...,None]*TUV[t,2]
    u=uv[...,0]*Wt-0.5; v=(1-uv[...,1])*Wt-0.5
    col=cv2.remap(tex,u.astype(np.float32),v.astype(np.float32),cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
    im=img[y0:y1+1,x0:x1+1]; im[upd]=col[upd]
    alpha[y0:y1+1,x0:x1+1][upd]=255; uvpix[y0:y1+1,x0:x1+1][upd]=np.stack([u,v],-1)[upd]
    tid[y0:y1+1,x0:x1+1][upd]=t
np.savez_compressed('planar.npz',uvpix=uvpix,img=img.astype(np.uint8),depth=depth,alpha=alpha,tid=tid,X0=X0,Z1=Z1,S=S)
cv2.imwrite('planar.png',img[:,:,::-1].astype(np.uint8))
print(img.shape)
