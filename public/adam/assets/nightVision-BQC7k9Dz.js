import{u as s}from"./index-CIqs7KLE.js";const x=`
  uniform sampler2D colorTexture;
  uniform float tint;
  uniform float debugMask;
  in vec2 v_textureCoordinates;

  // View ray through this pixel, intersected with the ellipsoid.
  // Returns the surface normal (world), or vec3(0) when the ray misses.
  vec3 surfaceNormal(vec2 uv) {
    vec4 ndc = vec4(uv * 2.0 - 1.0, 0.5, 1.0);
    vec4 far = czm_inverseViewProjection * ndc;
    vec3 point = far.xyz / far.w;
    vec3 origin = czm_viewerPositionWC;
    vec3 dir = normalize(point - origin);
    vec3 o = origin * czm_ellipsoidInverseRadii;
    vec3 d = dir * czm_ellipsoidInverseRadii;
    float a = dot(d, d);
    float b = dot(o, d);
    float c = dot(o, o) - 1.0;
    float disc = b * b - a * c;
    if (disc < 0.0) return vec3(0.0);
    float t = (-b - sqrt(disc)) / a;
    if (t < 0.0) return vec3(0.0);
    vec3 hit = o + d * t; // on the unit sphere of the scaled ellipsoid
    return normalize(hit * czm_ellipsoidInverseRadii);
  }

  void main() {
    vec4 color = texture(colorTexture, v_textureCoordinates);
    vec3 n = surfaceNormal(v_textureCoordinates);
    if (dot(n, n) < 0.5) {
      out_FragColor = color; // space and sky
      return;
    }
    float sunDot = dot(n, normalize(czm_sunDirectionWC));
    float night = smoothstep(0.06, -0.10, sunDot);

    // Coloured overlays stay as drawn.
    float maxC = max(color.r, max(color.g, color.b));
    float minC = min(color.r, min(color.g, color.b));
    float saturation = maxC > 0.0 ? (maxC - minC) / maxC : 0.0;
    float keep = smoothstep(0.4, 0.65, saturation) * step(0.3, maxC);
    float w = night * (1.0 - keep);

    if (debugMask > 0.5) {
      out_FragColor = vec4(night, keep, color.b, 1.0);
      return;
    }
    float lum = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 green = vec3(0.5, 1.0, 0.58) * (lum * 1.1 + 0.03);
    vec3 nvg = mix(color.rgb * 0.9, green, tint);
    out_FragColor = vec4(mix(color.rgb, nvg, w), color.a);
  }
`;function w({viewer:v,nightLights:o=null,tint:c=.6}={}){const l=v.scene,t=l.globe;let e=null,r=!1,u=!1,a=null;function p(){return e||(e=new Cesium.PostProcessStage({name:"adam-night-vision",fragmentShader:x,uniforms:{tint:()=>c,debugMask:()=>u?1:0}}),e.enabled=!1,l.postProcessStages.add(e),e)}const b=()=>{r&&t.enableLighting&&(t.enableLighting=!1)},g=l.preRender.addEventListener(b);function i(n){var m,f;const d=!!n;return d===r||(r=d,p().enabled=r,r?(a={lighting:t.enableLighting,groundAtmosphere:t.showGroundAtmosphere},t.enableLighting=!1,t.showGroundAtmosphere=!1,(m=o==null?void 0:o.suppress)==null||m.call(o,!0)):a&&(t.enableLighting=a.lighting,t.showGroundAtmosphere=a.groundAtmosphere,(f=o==null?void 0:o.suppress)==null||f.call(o,!1),a=null),s("night-vision")),r}return{set:i,toggle:()=>i(!r),isEnabled:()=>r,debug(n){u=!!n,s("night-vision")},setTint(n){Number.isFinite(n)&&(c=Math.max(0,Math.min(1,n))),s("night-vision")},destroy(){var n;i(!1),g(),e&&!((n=e.isDestroyed)!=null&&n.call(e))&&l.postProcessStages.remove(e),e=null}}}export{x as NVG_SHADER,w as createNightVision};
