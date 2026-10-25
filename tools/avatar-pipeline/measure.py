import numpy as np, cv2, json
img=cv2.imread('planar.png')[:,:,::-1].astype(np.float32)
clean=cv2.imread('clean.png')[:,:,::-1].astype(np.float32)
H,W=img.shape[:2]
res={}
hsv=cv2.cvtColor(img.astype(np.uint8),cv2.COLOR_RGB2HSV).astype(np.float32)
for side,(cx,cy) in {'L':(885,1560),'R':(2115,1560)}.items():
    box=np.zeros((H,W),np.uint8); cv2.ellipse(box,(cx,cy),(380,300),0,0,360,255,-1)
    r,g,b=img[...,0],img[...,1],img[...,2]
    lum=0.3*r+0.59*g+0.11*b
    sclera=(lum>205)&(hsv[...,1]<60)
    blue=(b>r+35)
    dark=(lum<85)
    m=((sclera|blue|dark)&(box>0)).astype(np.uint8)*255
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
    n,lab,st,cen=cv2.connectedComponentsWithStats(m)
    # component with largest area near center
    best=max(range(1,n),key=lambda i:st[i,4])
    comp=(lab==best).astype(np.uint8)*255
    cnts,_=cv2.findContours(comp,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    c=max(cnts,key=cv2.contourArea)
    full=np.zeros_like(comp); cv2.drawContours(full,[c],-1,255,-1)
    x,y,w,h=cv2.boundingRect(c)
    # iris
    bm=((blue)&(full>0)).astype(np.uint8)*255
    bm=cv2.morphologyEx(bm,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    pts=cv2.findNonZero(bm)
    (ix,iy),ir=cv2.minEnclosingCircle(pts)
    # pupil: dark pixels inside iris
    dm=((dark)&(full>0)).astype(np.uint8)
    yy,xx=np.mgrid[0:H,0:W]; inside=((xx-ix)**2+(yy-iy)**2<(ir*0.8)**2)
    pp=cv2.findNonZero(((dark)&inside).astype(np.uint8)*255)
    (px,py),pr=cv2.minEnclosingCircle(pp)
    # colours
    cols={}
    ring=(((xx-ix)**2+(yy-iy)**2<ir**2)&((xx-ix)**2+(yy-iy)**2>(ir*0.82)**2)&(blue))
    cols['iris_ring']=img[ring].mean(0).tolist()
    mid=(((xx-ix)**2+(yy-iy)**2<(ir*0.78)**2)&((xx-ix)**2+(yy-iy)**2>(pr*1.15)**2)&(blue))
    cols['iris_mid']=img[mid].mean(0).tolist() if mid.any() else cols['iris_ring']
    cols['pupil']=img[(((xx-px)**2+(yy-py)**2)<(pr*0.6)**2)].mean(0).tolist()
    scl=(sclera&(full>0)); cols['sclera']=img[scl].mean(0).tolist()
    dk=(dark&(full>0)&(~inside)); cols['outline']=img[dk].mean(0).tolist() if dk.any() else [60,30,25]
    res[side]=dict(bbox=[x,y,w,h],iris=[ix,iy,ir],pupil=[px,py,pr],cols=cols,contour=c[:,0,:].tolist())
    np.save(f'eye_mask_{side}.npy',full)
    print(side,[x,y,w,h],'iris',round(ix),round(iy),round(ir),'pupil',round(px),round(py),round(pr))
    print(' ',{k:[round(v) for v in vv] for k,vv in cols.items()})
json.dump(res,open('eyes.json','w'))
# debug overlay
dbg=img.astype(np.uint8).copy()
for s in 'LR':
    cv2.polylines(dbg,[np.array(res[s]['contour'],np.int32)],True,(255,0,255),4)
    ix,iy,ir=res[s]['iris']; cv2.circle(dbg,(int(ix),int(iy)),int(ir),(0,255,0),4)
    px,py,pr=res[s]['pupil']; cv2.circle(dbg,(int(px),int(py)),int(pr),(255,255,0),4)
cv2.imwrite('dbg_eyes.png',cv2.resize(dbg[:,:,::-1],(1000,1000),interpolation=cv2.INTER_AREA))
