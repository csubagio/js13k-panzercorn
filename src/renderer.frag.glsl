#version 300 es
precision highp float;
uniform lowp int k;
uniform sampler2D ft;
uniform mat4 vw;
uniform vec3 c, s;
in vec4 u;
in vec3 w;
in float r;
out vec4 o;
// Oklab reference matrices: https://bottosson.github.io/posts/oklab/ (public domain/MIT).
void main() {
  float a;
  if(k==9){
    a=(.2+.8*smoothstep(.0,.5,length(u.xy-.5)))*c.x;
    o=vec4(1, 0, 0,a);
    return;
  }
  vec3 e=transpose(mat3(vw))*vw[3].xyz,
    ry=normalize(w+e),
    l=vec3(c.x*(k==0?smoothstep(-.2,.2,ry.y*.35):u.w),mix(c.yz,.4*vec2(cos(u.y),sin(u.y)),u.z));
  a=.8+.2*min(1.,abs(r)*99.);
  if (k==5) {
    float tex=texture(ft,u.xy).r;
    l.x+=max(0.,tex*.5-.3);
    a=smoothstep(0.,.1,tex);
  }
  float fd=1.-smoothstep(.1,.38,ry.y);
  float fg=smoothstep(50.,500.,abs(k==0?ry.z*500.:w.z))*fd;
  if(k>3){fg=max(fg, pow(max(0.,1.-(abs(r)/9.)),4.)*.3);}
  if(k!=4){l=mix(l,s,fg);}
  l=mat3(1,1,1,.3963,-.1056,-.0895,.2158,-.0639,-1.29)*l;
  l*=l*l;
  vec3 s=mat3(4.077,-1.268,-.004,-3.308,2.6,-.7034,.23,-.3413,1.708)*l;
  o=vec4(mix(s*12.92,1.055*pow(max(s,0.),vec3(1./2.4))-.055,step(.0031,s)),a);
}
