#version 300 es

uniform lowp int k;
uniform float ws, pc;
uniform mat4 pr, vw, md, fm;
uniform vec3 cl;
uniform vec4 sp, tr[128];

out vec4 u;
out vec3 w;
out float r;

/** hash */
float hs(vec2 p) {
  p=fract(p*vec2(23.3,56.2));
  p+=dot(p,p+45.32);
  return fract(p.x*p.y);
}

/** noise */
float ns(vec2 p) {
  vec2 i=floor(p), f=fract(p);
  return mix(
    mix(hs(i), hs(i + vec2(1, 0)), f.x),
    mix(hs(i + vec2(0, 1)), hs(i + 1.), f.x),
    f.y
  );
}

/** fractal noise */
float fr(vec2 p) {
  float h = .5 * ns(p/37.);
  h += .25 * ns(p/19.+7.);
  return h + .1 * ns(p/9.+3.);
}

void main() {
  vec4 t, p, v;
  vec3 s, cp;
  u = vec4(0,0,0,1);
  r = 0.;
  float a;
  vec2 g = vec2(gl_VertexID >> 1, gl_InstanceID + (gl_VertexID & 1)) / cl.y;

  /*sky*/
  if (k == 0) {
    s = vec3(gl_VertexID == 1 ? 3. : -1., gl_VertexID == 2 ? 3. : -1., .999);
    mat3 iv = transpose(mat3(vw));
    // Keep this unnormalized: interpolation then reconstructs the exact ray per fragment.
    cp = -iv * vw[3].xyz;
    w = cp + iv * vec3(
      (pr[2][0] - s.x * pr[2][3]) / pr[0][0],
      (pr[2][1] - s.y * pr[2][3]) / pr[1][1],
      -1.
    ) * 400.;
    w = cp + transpose(mat3(fm)) * (w - cp);
    r = 1.;
    u.x = cl.x;
    gl_Position = vec4(s, 1);
    return;

  /*terrain*/
  } else if (k == 1) {
    u.xy=g-.5;
    t.w=pow(abs(u.x * 2.), 1.5)+.05;
    u.xy*=vec2(360., 1000.);
    t.x=1000./cl.y;
    t.y=ws;
    t.z=floor(t.y/t.x);
    s.xz=u.xy;
    s.z+=t.y-t.z*t.x;
    a=fr(u.xy-vec2(0.,t.z*t.x));
    t.w=a*t.w;
    s.y=max(0., -10.+115.*t.w);
    u.w=.4+t.w*3.3;
    s.x-=.6*a*u.x;
    s.z+=sin(s.z/5.+s.x/7.)*max(0.,1.-s.y)*2.;

  /*carpet*/
  } else if (k == 2) {
    u.xy = g-.5;
    t.x = pow(g.y, .6);
    a = sin(t.x * 14. - cl.x * 9.) * pow(length(u.xy),3.);
    u.w = .6 + a * .3;
    s = vec3(u.x, .2 + a * .4, u.y) * .7;

  /*capsulite*/
  } else if (k == 3) {
    t.x = g.y * 4. - 2.;
    t.y = clamp(t.x, -1., 1.);
    t.z = t.x - t.y;
    t.x = mix(sp.x, sp.y, t.x * .25 + .5);
    t.w = pow(max(1. - t.z * t.z, 0.), sp.w * .5);
    s.xy = vec2(cos(g.x * 6.2832), sin(g.x * 6.2832));
    s.xy = sign(s.xy) * pow(abs(s.xy), sp.ww);
    t.z = sign(t.z) * pow(abs(t.z), sp.w);
    t.y = t.y * sp.z + t.x * t.z;
    t.x = mix(sp.x, sp.y, clamp((t.y + sp.z + sp.x) / (2. * sp.z + sp.x + sp.y), 0., 1.));
    s = vec3(t.x * t.w * s.xy, t.y);

  /*trail*/
  } else if (k == 4) {
    int p = gl_VertexID >> 1;
    vec4 a = fm * md * vec4(tr[p].xyz, 1.), b = fm * md * vec4(tr[p + 1].xyz, 1.), av = vw * a, bv = vw * b;
    w = a.xyz;
    vec3 s = normalize(cross(bv.xyz - av.xyz, av.xyz));
    av.xyz += s * tr[p].w * float((gl_VertexID & 1) * 2 - 1);
    t.x = float(p)/cl.z;
    u.y = t.x*6.2;
    u.z = 1.;
    u.w = 1.3+.3*sin(cl.x*30.);
    gl_Position = pr * av;
    return;

  /*rainbow wall*/
  } else if (k == 6) {
    s=vec3(0.,g.y,g.x);
    u.y=g.x*9.-cl.x*9.;
    u.z=1.;

  /*asteroid*/
  } else if (k == 7) {
    u.xy=g;
    t.x=g.x*6.283;
    t.y=g.y*3.1416;
    s=vec3(cos(t.x)*sin(t.y),cos(t.y),sin(t.x)*sin(t.y));
    a=fr(s.xz*97.+abs(s.y)*73.+vec2(sp.w,sp.w*17.));
    s*=.5+a*.5;
    u.w=.4+a*.7;

  /*splash*/
  } else if (k == 8) {
    t = tr[gl_VertexID];
    s = t.xyz*sp.x;
    s.y += sp.w*t.w;
    p = fm*md*vec4(s,1);
    v = vw*p;
    w = p.xyz;
    u.z = 1.;
    u.y = g.x * 9.;
    u.w = sp.z;
    gl_Position = pr * v;
    gl_PointSize = pr[1][1]*pc/max(.01,-v.z)*sp.y*t.w;
    return;

  /*hurt overlay*/
  } else if (k == 9) {
    u.xy=g;
    s=sp.xyz+transpose(mat3(vw))*vec3((u.xy*2.-1.)*1.4,-1);
    gl_Position=pr*vw*vec4(s,1);
    return;

  /*label*/
  } else {
    u.xy = vec2(gl_VertexID & 1, gl_VertexID >> 1);
    t = tr[gl_InstanceID];
    s.xy = u.xy-.5;
    s.x += t.z;
    u.y = 1. - u.y;
    u.xy += t.xy;
    u.xy /= 16.;
  }

  p = md * vec4(s, 1.);
  r = p.y;
  w = (fm * p).xyz;
  u.w *= smoothstep(-5.,1.,normalize((fm * md * vec4(s, 0.))).y);
  gl_Position = pr * vw * vec4(w, 1.);
}
