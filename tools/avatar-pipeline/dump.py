import bpy, numpy as np, sys
glb=sys.argv[-2]; out=sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
o=bpy.data.objects['output_unwrapped']
me=o.data; me.calc_loop_triangles()
V=np.array([o.matrix_world@v.co for v in me.vertices],dtype=np.float64)
T=np.array([t.vertices[:] for t in me.loop_triangles])
uvl=me.uv_layers.active.data
UVL=np.array([uvl[i].uv[:] for i in range(len(uvl))])
TL=np.array([t.loops[:] for t in me.loop_triangles])
TUV=UVL[TL]  # (nt,3,2)
N=np.array([v.normal[:] for v in me.vertices])
names=[g.name for g in o.vertex_groups]
W=np.zeros((len(V),len(names)))
for v in me.vertices:
    for g in v.groups: W[v.index,g.group]=g.weight
print(len(V),len(T),names)
np.savez_compressed(out,V=V,T=T,TUV=TUV,N=N,W=W,names=np.array(names))
# head bone info
arm=bpy.data.objects['target_character']
for b in arm.data.bones:
    if b.name in('mixamorig:Head','mixamorig:Neck','headfront','mixamorig:HeadTop_End'):
        print(b.name,(arm.matrix_world@b.head_local)[:],(arm.matrix_world@b.tail_local)[:])
print('uv mesh layers',[l.name for l in me.uv_layers])
print('rot',o.rotation_euler,arm.rotation_euler,arm.scale,o.scale)
