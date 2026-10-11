import math, sys, json, os
from PIL import Image, ImageDraw, ImageChops, ImageFilter
S=10; N=20*S
HERE=os.path.dirname(os.path.abspath(__file__))
def hx(h):
    h=h.lstrip('#')
    if len(h)==3: h=''.join(ch*2 for ch in h)
    return tuple(int(h[i:i+2],16) for i in (0,2,4))
class C:
    def __init__(s,bg):
        s.img=Image.new('RGB',(N,N))
        px=s.img.load()
        for y in range(N):
            for x in range(N): px[x,y]=bg((x+.5)/N,(y+.5)/N)
    def P(s,pts): return [(x*S,y*S) for x,y in pts]
    def mask(s,fn):
        m=Image.new('L',(N,N),0); d=ImageDraw.Draw(m); fn(d); return m
    def poly(s,pts): return s.mask(lambda d:d.polygon(s.P(pts),fill=255))
    def ell(s,cx,cy,rx,ry=None):
        ry=ry or rx
        return s.mask(lambda d:d.ellipse([(cx-rx)*S,(cy-ry)*S,(cx+rx)*S,(cy+ry)*S],fill=255))
    def line(s,pts,w):
        def f(d):
            d.line(s.P(pts),fill=255,width=int(w*S),joint='curve')
            for x,y in pts: d.ellipse([(x-w/2)*S,(y-w/2)*S,(x+w/2)*S,(y+w/2)*S],fill=255)
        return s.mask(f)
    def fill(s,m,col): s.img.paste(hx(col),(0,0),m)
    def shift(s,m,dx,dy): return ImageChops.offset(m,int(dx*S),int(dy*S))
    def grow(s,m,r): return m.filter(ImageFilter.MaxFilter(int(r*S)*2+1))
    def obj(s,m,ramp,outline=None,ow=0.8,lit=1.4):
        if outline: s.fill(s.grow(m,ow),outline)
        s.fill(m,ramp[1])
        s.fill(ImageChops.multiply(m,ImageChops.invert(s.shift(m,-lit,-lit))),ramp[0])
        l=ImageChops.multiply(m,ImageChops.invert(s.shift(m,lit,lit)))
        s.fill(l,ramp[2])
        if len(ramp)>3:
            l2=ImageChops.multiply(m,ImageChops.invert(s.shift(m,lit*2.2,lit*2.2)))
            s.fill(ImageChops.multiply(l2,l),ramp[3])
    def out(s,cols):
        sm=s.img.resize((20,20),Image.BOX)
        P=[hx(k) for k in cols]
        idx=[[0]*20 for _ in range(20)]
        for y in range(20):
            for x in range(20):
                a=sm.getpixel((x,y))
                idx[y][x]=min(range(len(P)),key=lambda i:sum((P[i][k]-a[k])**2 for k in range(3)))
        return idx,sm

def grad(stops,ang=0):
    def f(xx,yy):
        if ang==0: t=yy
        elif ang==1: t=xx*0.5+yy*0.5
        else: t=((xx-.5)**2+(yy-.5)**2)**.5*1.4
        for (a,ca),(b,cb) in zip(stops,stops[1:]):
            if t<=b or (b,cb)==stops[-1]:
                u=min(1,max(0,(t-a)/(b-a)))
                A=hx(ca);B=hx(cb)
                return tuple(int(A[k]+(B[k]-A[k])*u) for k in range(3))
    return f
def sp(c,pts,col,r=.55):
    for x,y in pts: c.fill(c.ell(x,y,r),col)

icons={}
def refresher():
    c=C(grad([(0,'#03140a'),(1,'#0c3018')],1))
    for x,y,r in [(16.5,2.5,1.8),(18.3,4.5,1.2),(2.2,14,1.8),(3.5,17,1.2),(1.5,11,1.0),(17.5,1.2,1.0)]:
        c.fill(c.ell(x,y,r),'#4fc02a')
    orb=c.ell(9.8,10.2,8.4)
    c.obj(orb,['#0b4a1c','#1f8a2c','#4ec234','#8be84a'],'#03200c',0.8,1.6)
    pts=[]
    for i in range(40):
        th=i/40*math.pi*3.2+3.6; r=0.9+i*0.12
        pts.append((9.5+r*math.cos(th),10+r*math.sin(th)))
    c.fill(c.line(pts,2.2),'#a4f060')
    pts2=[(9.5+(0.5+i*0.1)*math.cos(i/40*math.pi*3.2+3.6+math.pi),10+(0.5+i*0.1)*math.sin(i/40*math.pi*3.2+3.6+math.pi)) for i in range(30)]
    c.fill(c.line(pts2,1.6),'#6bd43c')
    c.fill(c.ell(9.5,10,1.5),'#f0ffc8')
    return c,['#03140a','#0c3018','#4fc02a','#03200c','#0b4a1c','#1f8a2c','#4ec234','#8be84a','#a4f060','#6bd43c','#f0ffc8']
icons['refresher']=refresher
def atos():
    c=C(grad([(0,'#0c0604'),(1,'#2e1406')],1))
    c.fill(c.line([(0,14),(5,17),(12,19.5)],2.2),'#d0661a')
    c.fill(c.line([(1,12.5),(6,15.5),(10,17.2)],1.2),'#ff9a2a')
    sp(c,[(15,3),(17,6),(12,2),(18,9),(9,13),(3,8),(2,3),(19,2)],'#c85a14')
    rod=c.line([(5.5,4.8),(18,16)],3.8)
    c.obj(rod,['#5a606c','#a8aeb8','#dfe3e8','#ffffff'],'#10080a',0.8,1.2)
    knob=c.ell(4.3,3.2,2.6,2.4)
    c.obj(knob,['#5a606c','#b0b6c0','#e8ecf0','#ffffff'],'#10080a',0.8,1.2)
    c.fill(c.ell(7.2,6.6,1.5),'#ff2418'); c.fill(c.ell(6.8,6.2,0.6),'#ffb0a0')
    for x in (12,14.3,16.6):
        dy=(x-12)*.87
        c.fill(c.line([(x-.5,10.8+dy),(x+1.6,14.2+dy)],0.9),'#141418')
        c.fill(c.line([(x+1.6,10.4+dy),(x-.5,14.4+dy)],0.9),'#141418')
    return c,['#0c0604','#2e1406','#d0661a','#ff9a2a','#c85a14','#5a606c','#a8aeb8','#dfe3e8','#ffffff','#10080a','#ff2418','#ffb0a0','#141418','#1a0c06']
icons['atos']=atos
def vyse():
    c=C(grad([(0,'#0e3038'),(0.6,'#0a2228'),(1,'#06141a')],1))
    c.fill(c.poly([(0,19),(0,16),(2,17),(3,15),(5,16),(7,14),(9,16),(11,15),(12,19)]),'#06161c')
    arc=[(1,18.5),(0.8,14),(2,10.5),(4.5,7.5),(8,5.5),(10.5,5)]
    c.fill(c.line(arc,3.0),'#1a8c9c'); c.fill(c.line([(x+.3,y-.2) for x,y in arc],2.0),'#3ee0e8'); c.fill(c.line([(x+.7,y-.4) for x,y in arc],0.9),'#e8ffff')
    sp(c,[(10,11),(4,3),(16,13),(2,2)],'#bbffff')
    h=c.line([(13,5),(18.3,18.5)],3.6)
    c.obj(h,['#8a5a14','#d09a30','#f2cc68','#fff0a8'],'#1a1008',0.7,1.0)
    for y in (7.8,9.8):
        c.fill(c.line([(12.4+(y-5)*.4,y),(15.4+(y-5)*.4,y+.8)],0.9),'#3a2a1a')
    sk=c.poly([(4.3,5.3),(6,3.2),(9.5,2.6),(12.5,3.6),(13,6.4),(9.5,6.2),(7,8),(5,8.4)])
    c.obj(sk,['#8a7e6c','#d0c4ac','#f0e8d4','#ffffff'],'#1a1410',0.7,0.9)
    c.fill(c.ell(9.4,4.6,1.1,1.0),'#2a2018')
    hr=c.line([(8.5,3),(6,1.5),(4,2.5),(4.2,5)],1.8)
    c.obj(hr,['#2a2420','#5a5048','#8a8070'],'#140e0a',0.6,0.8)
    return c,['#0e3038','#0a2228','#06141a','#06161c','#2ec8d8','#8ef0f0','#e8ffff','#bbffff','#8a5a14','#d09a30','#f2cc68','#fff0a8','#1a1008','#3a2a1a','#8a7e6c','#d0c4ac','#f0e8d4','#ffffff','#1a1410','#2a2018','#2a2420','#5a5048','#8a8070','#140e0a']
icons['vyse']=vyse
def shiva():
    c=C(grad([(0,'#14303c'),(1,'#06121a')],1))
    body=c.poly([(0,20),(0,8),(2,3),(6,0.5),(14,0.5),(18,3),(20,8),(20,20)])
    c.obj(body,['#1c3a48','#3a6270','#6a98a4','#a0c8d0'],'#050e14',0.8,1.4)
    ring=c.poly([(5,10),(5,6),(7,3.8),(10.5,3.2),(13.5,4.5),(14.5,7),(12.5,9.5),(9,9.2),(7.5,7.5),(6.8,9.5)])
    c.fill(c.grow(ring,0.9),'#2cd0d8'); c.fill(ring,'#0a1c26')
    c.fill(c.ell(8.6,6.4,1.4,1.2),'#2cd0d8'); c.fill(c.ell(8.6,6.4,0.8,0.7),'#0a1c26')
    fur=c.poly([(0,11.5),(4,10.5),(10,11.5),(16,10.5),(20,11.5),(20,15),(15,15.5),(10,14.8),(5,15.5),(0,14.8)])
    c.obj(fur,['#9aaab0','#d8e4e8','#f4fafa','#ffffff'],'#0a1820',0.6,0.8)
    for x in range(1,20,2): c.fill(c.line([(x,12.5),(x-.5,14.5)],0.4),'#9aaab0')
    sp(c,[(3,17),(16,17.5),(18,1.5),(1.5,5)],'#e8ffff')
    return c,['#14303c','#06121a','#1c3a48','#3a6270','#6a98a4','#a0c8d0','#050e14','#2cd0d8','#0a1c26','#9aaab0','#d8e4e8','#f4fafa','#ffffff','#e8ffff']
icons['shiva']=shiva
def meteor():
    c=C(grad([(0,'#04070e'),(1,'#081a38')],1))
    c.fill(c.ell(11,11,9.5),'#0a2a58'); c.fill(c.ell(11,11,7.5),'#0e3c7c')
    h=c.line([(0.5,19),(7,13)],3.4)
    c.obj(h,['#2a2e38','#586070','#8c94a4','#c0c8d8'],'#04060a',0.7,0.9)
    c.fill(c.ell(2.6,15.8,.7),'#c0c8d8'); c.fill(c.ell(5.2,13.5,.7),'#c0c8d8')
    c.fill(c.line([(6.6,12.8),(8.4,11.2)],1.4),'#a8801e')
    head=c.poly([(4.5,8.5),(10.5,1.5),(18.8,5),(18.5,13),(12.5,18),(6,15)])
    c.fill(c.grow(head,1.2),'#2a9ae0')
    c.obj(head,['#5a6070','#868e9e','#b8c0cc','#e0e8f0'],'#08101c',0.8,1.4)
    core=c.ell(11.5,11,3.0)
    c.fill(c.grow(core,.8),'#1a78c0'); c.fill(core,'#58d0ff'); c.fill(c.ell(11.3,10.8,1.4),'#e8ffff')
    c.fill(c.line([(9.5,5),(11.5,9)],1.3),'#58d0ff')
    return c,['#04070e','#081a38','#0a2a58','#0e3c7c','#2a2e38','#586070','#8c94a4','#c0c8d8','#04060a','#a8801e','#2a9ae0','#5a6070','#868e9e','#b8c0cc','#e0e8f0','#08101c','#1a78c0','#58d0ff','#e8ffff']
icons['meteorhammer']=meteor
def bkb():
    c=C(grad([(0,'#06080e'),(1,'#0c1220')],1))
    sh=c.line([(11,6),(19,17)],4.2)
    c.obj(sh,['#161a24','#2c3242','#4a5266'],'#04050a',0.7,1.0)
    head=c.poly([(2,8),(4,4.5),(8,3),(12,4.5),(14,8),(18.5,15),(16,17),(11,13),(6,13.5),(3,12)])
    c.obj(head,['#a06a10','#e0a828','#ffd860','#fff0a8'],'#2a1604',0.8,1.3)
    crown=c.poly([(5,4.5),(4,1.5),(7,3),(8,0.5),(10,3),(13,1.5),(12,5)])
    c.obj(crown,['#a06a10','#e0a828','#ffd860'],'#2a1604',0.6,0.8)
    c.fill(c.grow(c.ell(6.8,8.2,1.9),.6),'#5a0a08'); c.fill(c.ell(6.8,8.2,1.7),'#d81414'); c.fill(c.ell(6.3,7.7,.6),'#ffb0a0')
    c.fill(c.ell(2.2,14.8,1.3),'#e0a828'); c.fill(c.ell(1.9,14.4,.5),'#fff0a8')
    c.fill(c.line([(5,13),(9,16),(14,16.5)],0.8),'#e0a828')
    return c,['#06080e','#0c1220','#161a24','#2c3242','#4a5266','#04050a','#a06a10','#e0a828','#ffd860','#fff0a8','#2a1604','#5a0a08','#d81414','#ffb0a0']
icons['bkb']=bkb
def blink():
    c=C(grad([(0,'#082c34'),(1,'#041a20')],1))
    for x,y in [(2,3),(4,1.5),(6,4),(1,7),(3,10),(8,2),(11,1),(15,2),(18,5),(18,9),(17,14),(14,18),(9,18),(5,16),(2,13),(19,12)]:
        c.fill(c.poly([(x,y-1.1),(x+.5,y),(x,y+1.1),(x-.5,y)]),'#3ac8d0')
    cres=c.mask(lambda d:(d.ellipse([3*S,2*S,18.5*S,17.5*S],fill=255),d.ellipse([1*S,-1*S,14*S,12*S],fill=0)))
    c.obj(cres,['#58b0c8','#b8e8f0','#f0ffff','#ffffff'],'#0a3a48',0.7,1.0)
    hd=c.mask(lambda d:(d.ellipse([8*S,0.5*S,17.5*S,9.5*S],fill=255),d.ellipse([10.5*S,3*S,15.5*S,8*S],fill=0),d.rectangle([8*S,5*S,12*S,10*S],fill=0)))
    c.obj(hd,['#0e3a8a','#2468d0','#58a0f0','#a0d0ff'],'#041028',0.6,0.8)
    return c,['#082c34','#041a20','#3ac8d0','#58b0c8','#b8e8f0','#f0ffff','#ffffff','#0a3a48','#0e3a8a','#2468d0','#58a0f0','#a0d0ff','#041028']
icons['blink']=blink
def scepter():
    c=C(grad([(0,'#1a0c38'),(1,'#0a0618')],1))
    sp(c,[(18,3),(15,1.5),(2,16),(5,18),(10,16),(17,10)],'#6a4ab0')
    st=c.line([(11,10),(19.5,17.5)],3.2)
    c.obj(st,['#4a1a0c','#9a4020','#d06a30','#f09a50'],'#120804',0.7,0.9)
    for t in (.45,.7):
        x=11+8.5*t;y=10+7.5*t
        c.fill(c.line([(x-.9,y+1),(x+.9,y-1)],.7),'#5a2010')
    gd=c.poly([(8.5,10),(12,7),(15.5,8),(18,12.5),(15.5,15),(11.5,14.5),(8.5,15)])
    c.obj(gd,['#a06a10','#e0a828','#ffd860','#fff0a8'],'#2a1604',0.7,1.0)
    c.fill(c.ell(13,11,1.3),'#3a60e0')
    for x,y in [(16,8.4),(8.8,14.5)]: c.fill(c.ell(x,y,.8),'#a050d8')
    cr=c.poly([(0.5,0.5),(6,-0.5),(11,5),(12.5,9.5),(8.5,12),(2.5,9.5),(0.5,4)])
    c.obj(cr,['#1a2c98','#2a64e8','#6aa4ff','#c0e0ff'],'#060a30',0.8,1.4)
    c.fill(c.line([(2.5,2),(8,7)],1.4),'#c0e0ff')
    return c,['#1a0c38','#0a0618','#6a4ab0','#4a1a0c','#9a4020','#d06a30','#f09a50','#120804','#5a2010','#a06a10','#e0a828','#ffd860','#fff0a8','#2a1604','#3a60e0','#a050d8','#1a2c98','#2a64e8','#6aa4ff','#c0e0ff','#060a30']
icons['scepter']=scepter
def shard():
    c=C(grad([(0,'#080a2c'),(1,'#341c78')],0))
    R=['#0c1670','#2450d8','#5a98ff','#c0e0ff']
    for pts in ([(1,8),(3,6),(5,9),(5,14),(3,15.5),(1.5,13)],[(11,13),(15,11),(18.5,13),(18,17),(14,17.5),(11.5,16)],[(4.5,9),(9,4),(13.5,5),(14,11),(9.5,17),(5.5,15.5)]):
        c.obj(c.poly(pts),R,'#040640',0.8,1.3)
    c.fill(c.line([(7,8),(10.5,6.5)],1.2),'#c0e0ff')
    c.fill(c.line([(9,9),(11.5,8)],0.9),'#7ab0ff')
    sp(c,[(6,2),(15,3),(18,8),(2,3),(12,2.5),(1,18)],'#8ab8ff')
    return c,['#080a2c','#341c78','#1c1450','#0c1670','#2450d8','#5a98ff','#c0e0ff','#040640','#7ab0ff','#8ab8ff']
icons['shard']=shard
def treads():
    c=C(grad([(0,'#16110e'),(1,'#4a3c2e')],0))
    full=c.poly([(2.5,2),(12.5,1.5),(12.5,9),(16,10.5),(19,13),(19.8,16.5),(18,18.8),(2.5,18.8)])
    c.obj(full,['#3a1c0a','#6a3a1a','#a0642c','#cc9048'],'#0c0604',0.8,1.4)
    c.fill(c.poly([(2.5,18.8),(18,18.8),(19.2,17.4),(2.5,17.6)]),'#2a1608')
    c.fill(c.poly([(3,2),(12,1.5),(12.3,4),(3,4.5)]),'#a89878')
    for x in range(3,12): c.fill(c.line([(x,1.8),(x,4.2)],.4),'#d8c8a0')
    for y0 in (5.6,8.8,12.0):
        b=c.poly([(2.8,y0),(12.2,y0-.5),(12.4,y0+1.7),(2.8,y0+2.2)])
        c.obj(b,['#8a6030','#d8b078','#f0d8a0'],'#2a1608',0.5,0.6)
        c.fill(c.ell(10.5,y0+0.9,1.0),'#f0d8a0'); c.fill(c.ell(10.5,y0+0.9,.4),'#5a3216')
    return c,['#16110e','#403428','#2a1608','#0c0604','#3a1c0a','#6a3a1a','#a0642c','#cc9048','#a89878','#d8c8a0','#8a6030','#d8b078','#f0d8a0','#5a3216']
icons['treads']=treads
def boots():
    c=C(grad([(0,'#08080a'),(1,'#2c241e')],0))
    L=['#6a4220','#b88848','#dcb070','#f0d098']
    shaft=c.poly([(4.5,3.5),(12,3.5),(13,11),(4,11)])
    foot=c.poly([(3,10),(13,10),(16.5,11),(19.2,13.5),(19.6,17),(18,18.8),(3,18.8)])
    cuff=c.poly([(3.5,1),(13,1),(13.5,5),(4,5.2)])
    c.obj(ImageChops.lighter(ImageChops.lighter(shaft,foot),cuff),L,'#0a0604',0.8,1.4)
    c.fill(c.line([(4,5.2),(13.4,5)],.6),'#6a4220')
    c.fill(c.poly([(3,15.5),(19.4,15.8),(19,18.5),(3,18.5)]),'#8a5a2a')
    c.fill(c.line([(3,15.8),(19.3,16)],.5),'#4a2c14')
    for x in range(4,19,2): c.fill(c.ell(x,17.2,.35),'#e8c890')
    return c,['#08080a','#2c241e','#6a4220','#b88848','#dcb070','#f0d098','#0a0604','#8a5a2a','#4a2c14','#e8c890']
icons['boots']=boots
def travels():
    c=C(grad([(0,'#4a2a10'),(.5,'#2a1608'),(1,'#120a04')],1))
    for pts,col in [([(0,6),(4,3),(9,1.5),(6,6),(4.5,11),(6,16),(2,19),(0,19)],'#b87838'),([(0,9),(2.5,5),(7,3),(4,8),(3,12),(3.5,17),(1,19),(0,18)],'#e0a860')]:
        c.fill(c.poly(pts),col)
    c.fill(c.line([(2,15),(3,9),(7,4)],.8),'#fff0c8')
    boot=c.poly([(10,2),(15,1),(18.5,3),(17,8),(15.5,12),(18,15),(18.5,18.5),(14,19),(9.5,17),(8.5,11),(9.5,6)])
    c.obj(boot,['#6a0e0c','#c42a18','#f0501e','#ff9a50'],'#1a0604',0.8,1.4)
    c.fill(c.line([(9.5,6),(8.7,11),(9.8,17),(14,18.8),(18,18.3)],.9),'#f0b030')
    c.fill(c.line([(16,2),(17.8,3.5)],.8),'#f0b030')
    c.fill(c.line([(11.5,5),(13,12)],.7),'#8a1410')
    return c,['#4a2a10','#2a1608','#120a04','#b87838','#e0a860','#fff0c8','#6a0e0c','#c42a18','#f0501e','#ff9a50','#1a0604','#f0b030','#8a1410']
icons['travels']=travels

order=['refresher','atos','vyse','shiva','meteorhammer','bkb','blink','scepter','shard','treads','travels','boots']
if __name__=='__main__':
    res={}
    sheet=Image.new('RGB',(4*248,3*248),(30,30,30))
    for i,n in enumerate(order):
        c,cols=icons[n]()
        idx,sm=c.out(cols)
        res[n]={'cols':cols,'idx':idx}
        sheet.paste(sm.resize((240,240),Image.NEAREST),((i%4)*248,(i//4)*248))
        # quantized preview
    q=Image.new('RGB',(4*248,3*248),(30,30,30))
    for i,n in enumerate(order):
        cols=res[n]['cols'];idx=res[n]['idx']
        im=Image.new('RGB',(20,20))
        for y in range(20):
            for x in range(20): im.putpixel((x,y),hx(cols[idx[y][x]]))
        q.paste(im.resize((240,240),Image.NEAREST),((i%4)*248,(i//4)*248))
    q.save(os.path.join(sys.argv[1],'mine.png'))
    json.dump(res,open(os.path.join(HERE,'res.json'),'w'))
