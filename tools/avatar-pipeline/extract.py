import struct, json, sys
p=sys.argv[1]; d=open(p,'rb').read()
cl,_=struct.unpack('<II',d[12:20]); j=json.loads(d[20:20+cl])
off=20+cl; bl,_=struct.unpack('<II',d[off:off+8]); binb=d[off+8:off+8+bl]
for i,im in enumerate(j['images']):
    bv=j['bufferViews'][im['bufferView']]
    open(f"{im['name']}.png",'wb').write(binb[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])
