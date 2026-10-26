import{aa as w,u as y}from"./index-CIqs7KLE.js";const C=.45,_=8;function E(t,a=null){const o=t.camera,s=Math.max(1,t.scene.canvas.clientWidth||t.scene.canvas.width);if(a&&Number.isFinite(a.widthKm)&&a.widthKm>0)return a.widthKm*1e3/s;const i=o.positionCartographic,e=o.frustum&&"fov"in o.frustum?o.frustum.fov:Math.PI/3;return 2*Math.max(1,i.height)*Math.tan(e/2)/s}function S(t,a=C){return!Number.isFinite(t)||t<=0?1:Math.max(1,Math.min(_,a/t))}function k(t){return Math.max(0,Math.min(1,(t-1.15)/3))}const A=`
  uniform sampler2D colorTexture;
  uniform float amount;
  in vec2 v_textureCoordinates;

  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

  void main() {
    vec2 px = 1.0 / czm_viewport.zw;
    vec2 uv = v_textureCoordinates;
    vec4 base = texture(colorTexture, uv);
    if (amount <= 0.001) { out_FragColor = base; return; }

    // 3×3 neighbourhood: a soft blur for the unsharp mask and the local mean.
    vec3 sum = vec3(0.0);
    float lumaMin = 1.0, lumaMax = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 c = texture(colorTexture, uv + vec2(float(x), float(y)) * px).rgb;
        float wgt = (x == 0 && y == 0) ? 4.0 : ((x == 0 || y == 0) ? 2.0 : 1.0);
        sum += c * wgt;
        float l = luma(c);
        lumaMin = min(lumaMin, l);
        lumaMax = max(lumaMax, l);
      }
    }
    vec3 blur = sum / 16.0;
    // Wider ring for local contrast (5 px).
    vec3 wide = vec3(0.0);
    for (int y = -2; y <= 2; y += 2) {
      for (int x = -2; x <= 2; x += 2) {
        wide += texture(colorTexture, uv + vec2(float(x), float(y)) * px * 2.5).rgb;
      }
    }
    wide /= 9.0;

    // Guided: only where there is an edge to sharpen (flat sky/water stays clean).
    float edge = smoothstep(0.02, 0.12, lumaMax - lumaMin);
    vec3 detail = (base.rgb - blur) * (1.6 * amount * edge);
    vec3 local = (base.rgb - wide) * (0.35 * amount);
    vec3 c = base.rgb + detail + local;
    // A little saturation back.
    float l = luma(c);
    c = mix(vec3(l), c, 1.0 + 0.25 * amount);
    out_FragColor = vec4(clamp(c, 0.0, 1.0), base.a);
  }
`;function T({viewer:t,doc:a=document,groundView:o=()=>null,budget:s=()=>null}){const i=t.scene;let e=null,c=!0,n=0,u=0,m=1,h=0;const r=a.createElement("div");r.className="adam-enhance-readout adam-readout",r.hidden=!0,a.body.append(r);function x(){return e||(e=new Cesium.PostProcessStage({name:"adam-enhance",fragmentShader:A,uniforms:{amount:()=>n}}),e.enabled=!1,i.postProcessStages.add(e),e)}function p(){const f=performance.now();if(f-h>200){h=f;const l=s();if(!(c&&((l==null?void 0:l.effects)??!0)))u=0;else{const g=w({lat:0,lon:0,altM:t.camera.positionCartographic.height},o()),M=E(t,g.source==="camera"?null:o());m=S(M),u=k(m)}}const v=n+(u-n)*.12;Math.abs(v-n)>.002?(n=v,y("enhance")):n=u;const d=n>.01;if(d!==!!(e!=null&&e.enabled)&&(x().enabled=d),r.hidden=!d,d){const l=`enhancing · ×${m.toFixed(1)} past native`;r.textContent!==l&&(r.textContent=l)}}const b=i.preRender.addEventListener(p);return{enabled:()=>c,active:()=>n>.01,ratio:()=>m,set(f){return c=!!f,c||(u=0),{ok:!0,enabled:c}},destroy(){b(),e&&i.postProcessStages.remove(e),e=null,r.remove()}}}export{A as ENHANCE_SHADER,C as NATIVE_GSD_M,k as amountFor,T as createEnhancer,S as magnification,E as viewGsdM};
