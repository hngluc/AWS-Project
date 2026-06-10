

// Vertex shader that generates a fullscreen quad using a single triangle.
// This requires WebGL 2 and avoids the need to set up vertex buffer objects (VBOs).
export const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

out vec2 v_texCoord;

void main() {
    // Generate a fullscreen triangle:
    // gl_VertexID = 0 -> (-1.0, -1.0) -> uv (0.0, 0.0)
    // gl_VertexID = 1 -> ( 3.0, -1.0) -> uv (2.0, 0.0)
    // gl_VertexID = 2 -> (-1.0,  3.0) -> uv (0.0, 2.0)
    float x = -1.0 + float((gl_VertexID & 1) << 2);
    float y = -1.0 + float((gl_VertexID & 2) << 1);
    v_texCoord = vec2(x * 0.5 + 0.5, y * 0.5 + 0.5);
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

// Simple passthrough fragment shader for rendering to canvas screen.
export const PASSTHROUGH_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_texture;

void main() {
    outColor = texture(u_texture, v_texCoord);
}
`;

export const EFFECT_GRAYSCALE = {
  id: 'grayscale',
  name: 'Grayscale',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform float u_intensity;

  void main() {
      vec4 texColor = texture(u_texture, v_texCoord);
      // NTSC formula for relative luminance
      float luminance = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
      vec3 grayColor = vec3(luminance);
      outColor = vec4(mix(texColor.rgb, grayColor, u_intensity), texColor.a);
  }
  `,
  uniforms: [
    {
      name: 'u_intensity',
      label: 'Intensity',
      type: 'float',
      defaultValue: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
};

export const EFFECT_TINT = {
  id: 'tint',
  name: 'Color Tint',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec3 u_tintColor;
  uniform float u_intensity;

  void main() {
      vec4 texColor = texture(u_texture, v_texCoord);
      vec3 tinted = texColor.rgb * u_tintColor;
      outColor = vec4(mix(texColor.rgb, tinted, u_intensity), texColor.a);
  }
  `,
  uniforms: [
    {
      name: 'u_tintColor',
      label: 'Tint Color',
      type: 'color',
      defaultValue: '#ff5500',
    },
    {
      name: 'u_intensity',
      label: 'Intensity',
      type: 'float',
      defaultValue: 0.5,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
};

export const EFFECT_CHROMATIC_ABERRATION = {
  id: 'chromatic-aberration',
  name: 'Chromatic Aberration',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_redOffset;
  uniform vec2 u_blueOffset;
  uniform float u_radial;
  uniform float u_mixIntensity;

  void main() {
      vec4 original = texture(u_texture, v_texCoord);
      vec2 centered = v_texCoord - 0.5;
      vec2 radialOffset = centered * dot(centered, centered) * u_radial;
      float r = texture(u_texture, clamp(v_texCoord + u_redOffset + radialOffset, vec2(0.0), vec2(1.0))).r;
      float g = original.g;
      float b = texture(u_texture, clamp(v_texCoord + u_blueOffset - radialOffset, vec2(0.0), vec2(1.0))).b;
      vec3 split = vec3(r, g, b);
      outColor = vec4(mix(original.rgb, split, u_mixIntensity), original.a);
  }
  `,
  uniforms: [
    {
      name: 'u_redOffset',
      label: 'Red Offset (X, Y)',
      type: 'vec2',
      defaultValue: [0.005, 0.0],
      min: -0.05,
      max: 0.05,
      step: 0.001,
    },
    {
      name: 'u_blueOffset',
      label: 'Blue Offset (X, Y)',
      type: 'vec2',
      defaultValue: [-0.005, 0.0],
      min: -0.05,
      max: 0.05,
      step: 0.001,
    },
    {
      name: 'u_radial',
      label: 'Lens Fringe',
      type: 'float',
      defaultValue: 0.025,
      min: -0.2,
      max: 0.2,
      step: 0.001,
    },
    {
      name: 'u_mixIntensity',
      label: 'Mix Blend',
      type: 'float',
      defaultValue: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
};

export const EFFECT_PIXELATE = {
  id: 'pixelate',
  name: 'Pixelate',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_pixelSize;
  uniform float u_colorLevels;
  uniform float u_softness;

  void main() {
      float size = max(1.0, u_pixelSize);
      vec2 cellSize = size / u_resolution;
      vec2 cellCenter = (floor(v_texCoord / cellSize) + 0.5) * cellSize;
      vec2 local = fract(v_texCoord / cellSize);
      vec2 edgeBlend = smoothstep(vec2(0.0), vec2(max(u_softness, 0.001)), local) *
                       (1.0 - smoothstep(vec2(1.0 - max(u_softness, 0.001)), vec2(1.0), local));
      float blend = edgeBlend.x * edgeBlend.y;
      vec4 pixelColor = texture(u_texture, clamp(cellCenter, vec2(0.0), vec2(1.0)));
      vec4 original = texture(u_texture, v_texCoord);
      float levels = max(2.0, floor(u_colorLevels));
      pixelColor.rgb = floor(pixelColor.rgb * levels + 0.5) / levels;
      outColor = mix(original, pixelColor, blend);
  }
  `,
  uniforms: [
    {
      name: 'u_pixelSize',
      label: 'Block Size (Pixels)',
      type: 'float',
      defaultValue: 8.0,
      min: 1.0,
      max: 100.0,
      step: 1.0,
    },
    {
      name: 'u_colorLevels',
      label: 'Color Levels',
      type: 'float',
      defaultValue: 32.0,
      min: 2.0,
      max: 64.0,
      step: 1.0,
    },
    {
      name: 'u_softness',
      label: 'Cell Softness',
      type: 'float',
      defaultValue: 0.04,
      min: 0.001,
      max: 0.35,
      step: 0.001,
    },
  ],
};

export const EFFECT_WAVE_DISTORTION = {
  id: 'wave-distortion',
  name: 'Wave Distortion',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform float u_amplitude;
  uniform float u_frequency;
  uniform float u_time;
  uniform float u_speed;
  uniform float u_direction;
  uniform float u_mixIntensity;

  void main() {
      vec4 original = texture(u_texture, v_texCoord);
      float phaseX = v_texCoord.y * u_frequency + u_time * u_speed;
      float phaseY = v_texCoord.x * u_frequency * 0.73 - u_time * u_speed * 0.81;
      vec2 offset = vec2(sin(phaseX), cos(phaseY)) * u_amplitude;
      offset = mix(vec2(offset.x, 0.0), vec2(0.0, offset.y), clamp(u_direction, 0.0, 1.0));
      vec2 uv = v_texCoord + offset;
      uv = clamp(uv, vec2(0.0), vec2(1.0));
      vec4 warped = texture(u_texture, uv);
      outColor = mix(original, warped, u_mixIntensity);
  }
  `,
  uniforms: [
    {
      name: 'u_amplitude',
      label: 'Amplitude (Width)',
      type: 'float',
      defaultValue: 0.015,
      min: 0.0,
      max: 0.1,
      step: 0.001,
    },
    {
      name: 'u_frequency',
      label: 'Frequency (Ripples)',
      type: 'float',
      defaultValue: 15.0,
      min: 1.0,
      max: 100.0,
      step: 0.5,
    },
    {
      name: 'u_speed',
      label: 'Wave Speed',
      type: 'float',
      defaultValue: 5.0,
      min: -15.0,
      max: 15.0,
      step: 0.1,
    },
    {
      name: 'u_direction',
      label: 'Direction (Horizontal / Vertical)',
      type: 'float',
      defaultValue: 0.0,
      min: 0.0,
      max: 1.0,
      step: 1.0,
    },
    {
      name: 'u_mixIntensity',
      label: 'Mix Blend',
      type: 'float',
      defaultValue: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_VHS = {
  id: 'vhs',
  name: 'VHS Analog Glitch',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_scanlineIntensity;
  uniform float u_noiseIntensity;
  uniform float u_tracking;
  uniform float u_colorBleed;

  float noise(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
      // 1. Rolling vertical tracking bar distortion
      float roll = fract(u_time * (0.08 + u_tracking * 0.2));
      float dist = abs(v_texCoord.y - roll);
      
      float barStrength = smoothstep(0.09, 0.0, dist) * u_tracking;
      float lineJitter = (noise(vec2(floor(v_texCoord.y * 260.0), floor(u_time * 24.0))) - 0.5);
      float barShift = sin(v_texCoord.y * 70.0 + u_time * 9.0) * 0.018 * barStrength;
      barShift += lineJitter * 0.006 * u_noiseIntensity;

      vec2 uv = vec2(v_texCoord.x + barShift, v_texCoord.y);
      uv = clamp(uv, vec2(0.0), vec2(1.0));

      // 2. Fetch color with slight color channel splitting inside the rolling bar
      float bleed = 0.001 + u_colorBleed * 0.008;
      float r = texture(u_texture, uv + vec2(bleed + barShift * 0.5, 0.0)).r;
      float g = texture(u_texture, uv).g;
      float b = texture(u_texture, uv - vec2(bleed + barShift * 0.5, 0.0)).b;
      vec4 texColor = vec4(r, g, b, texture(u_texture, uv).a);

      // 3. Add analog high-frequency snow/noise static
      float n = (noise(uv * u_resolution.xy + floor(u_time * 30.0)) - 0.5) * u_noiseIntensity * 0.18;
      texColor.rgb += vec3(n);

      // 4. CRT scanlines (sine wave multiplying rows)
      float scanline = sin(uv.y * 1000.0) * 0.5 + 0.5;
      texColor.rgb *= mix(1.0, scanline, u_scanlineIntensity);

      outColor = texColor;
  }
  `,
  uniforms: [
    {
      name: 'u_scanlineIntensity',
      label: 'Scanline Intensity',
      type: 'float',
      defaultValue: 0.35,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_noiseIntensity',
      label: 'Static Noise & Jitter',
      type: 'float',
      defaultValue: 0.25,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_tracking',
      label: 'Tape Tracking',
      type: 'float',
      defaultValue: 0.45,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_colorBleed',
      label: 'Color Bleed',
      type: 'float',
      defaultValue: 0.35,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_BAD_TV = {
  id: 'bad-tv',
  name: 'Bad TV Signal',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_glitchFrequency;
  uniform float u_glitchIntensity;

  float rand(float co) {
      return fract(sin(co * 12.9898) * 43758.5453);
  }

  void main() {
      vec2 uv = v_texCoord;
      
      // Quantize time to create blocky/jerky refresh rates (12 frames/sec)
      float timeStep = floor(u_time * 12.0);
      
      // A. Large horizontal tearing block distortion
      float blockY = floor(uv.y * 12.0);
      float blockNoise = rand(blockY + timeStep);
      
      if (blockNoise < u_glitchFrequency * 0.4) {
          // Displace coordinates horizontally
          uv.x += (rand(blockY + timeStep + 1.0) - 0.5) * u_glitchIntensity * 0.12;
      }
      
      // B. Fine vertical scanline tearing line splits
      float fineY = floor(uv.y * 80.0);
      float fineNoise = rand(fineY + timeStep + 2.0);
      
      if (fineNoise < u_glitchFrequency * 0.12) {
          uv.x += (rand(fineY + timeStep + 3.0) - 0.5) * u_glitchIntensity * 0.25;
      }

      uv = clamp(uv, vec2(0.0), vec2(1.0));
      vec4 texColor = texture(u_texture, uv);

      // C. Random signal snow burst discoloration in blocky areas
      if (blockNoise < u_glitchFrequency * 0.15) {
          float noiseFactor = rand(uv.y + uv.x + u_time) * 0.2 * u_glitchIntensity;
          texColor.rgb += vec3(noiseFactor);
      }

      outColor = texColor;
  }
  `,
  uniforms: [
    {
      name: 'u_glitchFrequency',
      label: 'Glitch Frequency',
      type: 'float',
      defaultValue: 0.45,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_glitchIntensity',
      label: 'Tear Displacement',
      type: 'float',
      defaultValue: 0.3,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_PALETTE = {
  id: 'palettization',
  name: 'Color Palettization',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform float u_palette; // 0 = GameBoy, 1 = Cyberpunk, 2 = CGA
  uniform float u_mixIntensity;

  // Pre-defined color palettes
  // 0. GameBoy Green (4 shades)
  vec3 gb[4] = vec3[](
      vec3(0.0588, 0.2196, 0.0588),
      vec3(0.1882, 0.3804, 0.1882),
      vec3(0.5490, 0.6784, 0.2196),
      vec3(0.6078, 0.7294, 0.0588)
  );

  // 1. Cyberpunk Neon (5 colors)
  vec3 cyber[5] = vec3[](
      vec3(0.0509, 0.0078, 0.0980),
      vec3(0.0, 0.9529, 0.9529),
      vec3(0.9529, 0.0, 0.5490),
      vec3(0.9529, 0.8235, 0.0),
      vec3(1.0, 1.0, 1.0)
  );

  // 2. Retro CGA (4 colors)
  vec3 cga[4] = vec3[](
      vec3(0.0, 0.0, 0.0),
      vec3(0.0, 0.6667, 0.6667),
      vec3(0.6667, 0.0, 0.6667),
      vec3(0.6667, 0.6667, 0.6667)
  );

  vec3 getClosestColor(vec3 color, int palIdx) {
      vec3 closest = color;
      float minDist = 9999.0;

      if (palIdx == 0) {
          for (int i = 0; i < 4; i++) {
              float dist = distance(color, gb[i]);
              if (dist < minDist) {
                  minDist = dist;
                  closest = gb[i];
              }
          }
      } else if (palIdx == 1) {
          for (int i = 0; i < 5; i++) {
              float dist = distance(color, cyber[i]);
              if (dist < minDist) {
                  minDist = dist;
                  closest = cyber[i];
              }
          }
      } else {
          for (int i = 0; i < 4; i++) {
              float dist = distance(color, cga[i]);
              if (dist < minDist) {
                  minDist = dist;
                  closest = cga[i];
              }
          }
      }
      return closest;
  }

  void main() {
      vec4 original = texture(u_texture, v_texCoord);
      int palIdx = int(clamp(u_palette, 0.0, 2.0));
      vec3 quantized = getClosestColor(original.rgb, palIdx);
      
      outColor = vec4(mix(original.rgb, quantized, u_mixIntensity), original.a);
  }
  `,
  uniforms: [
    {
      name: 'u_palette',
      label: 'Palette (0:GB, 1:Cyber, 2:CGA)',
      type: 'float',
      defaultValue: 0.0,
      min: 0.0,
      max: 2.0,
      step: 1.0,
    },
    {
      name: 'u_mixIntensity',
      label: 'Mix Blend',
      type: 'float',
      defaultValue: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
};

export const EFFECT_DATA_MOSH = {
  id: 'datamosh',
  name: 'Data Mosh (Motion Smear)',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;

  uniform float u_blockSize;
  uniform float u_moshIntensity;
  uniform float u_flowSpeed;
  uniform float u_smearCount;
  uniform float u_lumaGate;
  uniform float u_directionBias;

  // Hash function for pseudo-random coordinates
  float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
  }

  // Generate random block motion vectors over quantized time slices
  vec2 getMotionVector(vec2 blockId, float timeStep) {
      float r1 = hash21(blockId + timeStep);
      float r2 = hash21(blockId + timeStep + 7.4);
      return vec2(r1 - 0.5, r2 - 0.5) * 2.0; // Range [-1.0, 1.0]
  }

  void main() {
      // 1. Block quantization
      float size = max(4.0, u_blockSize);
      vec2 blockId = floor(v_texCoord * u_resolution / size);
      
      // 2. Refresh flow vectors based on flow speed
      float timeStep = floor(u_time * u_flowSpeed);
      
      // 3. Motion vector vector offset lookup
      vec4 original = texture(u_texture, v_texCoord);
      float luma = dot(original.rgb, vec3(0.299, 0.587, 0.114));
      float gate = smoothstep(u_lumaGate - 0.18, u_lumaGate + 0.18, luma);
      vec2 randomMotion = getMotionVector(blockId, timeStep);
      vec2 directedMotion = vec2(sign(randomMotion.x), randomMotion.y * 0.18);
      vec2 motion = mix(randomMotion, directedMotion, u_directionBias) *
                    u_moshIntensity * 0.08 * gate;
      
      // 4. Multi-tap smear blend
      vec4 accColor = vec4(0.0);
      float totalWeight = 0.0;
      int steps = int(clamp(u_smearCount, 1.0, 15.0));
      
      for (int i = 0; i < 15; i++) {
          if (i >= steps) break;
          float t = float(i) / max(1.0, float(steps - 1));
          vec2 offsetUv = v_texCoord - motion * t;
          offsetUv = clamp(offsetUv, vec2(0.0), vec2(1.0));
          
          float weight = 1.0 - t * 0.5; // Smooth smear decay fade
          accColor += texture(u_texture, offsetUv) * weight;
          totalWeight += weight;
      }
      
      vec4 smeared = accColor / max(totalWeight, 0.0001);
      outColor = mix(original, smeared, clamp(gate + u_moshIntensity * 0.35, 0.0, 1.0));
  }
  `,
  uniforms: [
    {
      name: 'u_blockSize',
      label: 'Block Size (Pixels)',
      type: 'float',
      defaultValue: 16.0,
      min: 4.0,
      max: 64.0,
      step: 1.0,
    },
    {
      name: 'u_moshIntensity',
      label: 'Mosh Displacement',
      type: 'float',
      defaultValue: 0.45,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_flowSpeed',
      label: 'Vector Shift Speed',
      type: 'float',
      defaultValue: 8.0,
      min: 1.0,
      max: 30.0,
      step: 0.5,
    },
    {
      name: 'u_smearCount',
      label: 'Smear Quality (Taps)',
      type: 'float',
      defaultValue: 8.0,
      min: 1.0,
      max: 15.0,
      step: 1.0,
    },
    {
      name: 'u_lumaGate',
      label: 'Brightness Gate',
      type: 'float',
      defaultValue: 0.32,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_directionBias',
      label: 'Horizontal Bias',
      type: 'float',
      defaultValue: 0.7,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_HALFTONE = {
  id: 'halftone-print',
  name: 'Halftone Print',
  description: 'Rotated print dots driven by source luminance.',
  sourceUrl: 'https://www.shadertoy.com/view/Ds2fRD',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_dotSize;
  uniform float u_angle;
  uniform float u_contrast;
  uniform float u_mixIntensity;

  mat2 rotate2d(float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return mat2(c, -s, s, c);
  }

  void main() {
      vec4 original = texture(u_texture, v_texCoord);
      vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
      vec2 centered = (v_texCoord - 0.5) * aspect;
      vec2 grid = rotate2d(u_angle) * centered * max(u_dotSize, 2.0);
      vec2 cell = fract(grid) - 0.5;

      float luminance = dot(original.rgb, vec3(0.299, 0.587, 0.114));
      luminance = clamp((luminance - 0.5) * u_contrast + 0.5, 0.0, 1.0);
      float radius = mix(0.46, 0.08, luminance);
      float dotMask = 1.0 - smoothstep(radius - 0.035, radius + 0.035, length(cell));

      vec3 ink = mix(vec3(1.0), original.rgb * 0.72, dotMask);
      outColor = vec4(mix(original.rgb, ink, u_mixIntensity), original.a);
  }
  `,
  uniforms: [
    {
      name: 'u_dotSize',
      label: 'Dot Density',
      type: 'float',
      defaultValue: 95.0,
      min: 20.0,
      max: 220.0,
      step: 1.0,
    },
    {
      name: 'u_angle',
      label: 'Screen Angle',
      type: 'float',
      defaultValue: 0.35,
      min: -1.57,
      max: 1.57,
      step: 0.01,
    },
    {
      name: 'u_contrast',
      label: 'Print Contrast',
      type: 'float',
      defaultValue: 1.25,
      min: 0.5,
      max: 2.5,
      step: 0.01,
    },
    {
      name: 'u_mixIntensity',
      label: 'Mix Blend',
      type: 'float',
      defaultValue: 0.9,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
};

export const EFFECT_KALEIDOSCOPE = {
  id: 'kaleidoscope',
  name: 'Kaleidoscope Mirror',
  description: 'Mirrored radial repetition with animated rotation.',
  sourceUrl: 'https://www.shadertoy.com/view/WdcSRr',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_segments;
  uniform float u_rotation;
  uniform float u_zoom;
  uniform float u_speed;

  void main() {
      vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
      vec2 p = (v_texCoord - 0.5) * aspect;
      float radius = length(p) / max(u_zoom, 0.1);
      float angle = atan(p.y, p.x) + u_rotation + u_time * u_speed;
      float slice = 6.28318530718 / max(2.0, floor(u_segments));
      angle = abs(mod(angle + slice * 0.5, slice) - slice * 0.5);

      vec2 folded = vec2(cos(angle), sin(angle)) * radius;
      vec2 uv = folded / aspect + 0.5;
      uv = 1.0 - abs(mod(uv, 2.0) - 1.0);
      outColor = texture(u_texture, clamp(uv, vec2(0.0), vec2(1.0)));
  }
  `,
  uniforms: [
    {
      name: 'u_segments',
      label: 'Mirror Segments',
      type: 'float',
      defaultValue: 8.0,
      min: 2.0,
      max: 24.0,
      step: 1.0,
    },
    {
      name: 'u_rotation',
      label: 'Rotation',
      type: 'float',
      defaultValue: 0.0,
      min: -3.14,
      max: 3.14,
      step: 0.01,
    },
    {
      name: 'u_zoom',
      label: 'Zoom',
      type: 'float',
      defaultValue: 1.0,
      min: 0.45,
      max: 2.0,
      step: 0.01,
    },
    {
      name: 'u_speed',
      label: 'Spin Speed',
      type: 'float',
      defaultValue: 0.08,
      min: -0.8,
      max: 0.8,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_NEON_EDGE = {
  id: 'neon-edge',
  name: 'Neon Sobel Edge',
  description: 'Sobel edge extraction mixed with a configurable neon color.',
  sourceUrl: 'https://www.shadertoy.com/view/Xdf3Rf',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform vec3 u_edgeColor;
  uniform float u_strength;
  uniform float u_threshold;
  uniform float u_background;

  float luma(vec2 uv) {
      return dot(texture(u_texture, clamp(uv, vec2(0.0), vec2(1.0))).rgb, vec3(0.299, 0.587, 0.114));
  }

  void main() {
      vec2 px = 1.0 / max(u_resolution, vec2(1.0));
      float tl = luma(v_texCoord + px * vec2(-1.0, 1.0));
      float tc = luma(v_texCoord + px * vec2(0.0, 1.0));
      float tr = luma(v_texCoord + px * vec2(1.0, 1.0));
      float ml = luma(v_texCoord + px * vec2(-1.0, 0.0));
      float mr = luma(v_texCoord + px * vec2(1.0, 0.0));
      float bl = luma(v_texCoord + px * vec2(-1.0, -1.0));
      float bc = luma(v_texCoord + px * vec2(0.0, -1.0));
      float br = luma(v_texCoord + px * vec2(1.0, -1.0));

      float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
      float gy = tl + 2.0 * tc + tr - bl - 2.0 * bc - br;
      float edge = smoothstep(u_threshold, u_threshold + 0.18, length(vec2(gx, gy)) * u_strength);

      vec4 original = texture(u_texture, v_texCoord);
      vec3 base = original.rgb * u_background;
      vec3 neon = u_edgeColor * edge * (1.0 + edge * 0.8);
      outColor = vec4(base + neon, original.a);
  }
  `,
  uniforms: [
    {
      name: 'u_edgeColor',
      label: 'Neon Color',
      type: 'color',
      defaultValue: '#00f5ff',
    },
    {
      name: 'u_strength',
      label: 'Edge Strength',
      type: 'float',
      defaultValue: 1.4,
      min: 0.2,
      max: 4.0,
      step: 0.01,
    },
    {
      name: 'u_threshold',
      label: 'Edge Threshold',
      type: 'float',
      defaultValue: 0.12,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_background',
      label: 'Source Visibility',
      type: 'float',
      defaultValue: 0.22,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
};

export const EFFECT_RADIAL_BLUR = {
  id: 'radial-blur',
  name: 'Radial Zoom Blur',
  description: 'Multi-tap zoom streaks focused around a movable center.',
  sourceUrl: 'https://www.shadertoy.com/view/lXjBWK',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_center;
  uniform float u_strength;
  uniform float u_samples;

  void main() {
      vec2 direction = v_texCoord - u_center;
      vec4 sum = vec4(0.0);
      float weightSum = 0.0;
      int samples = int(clamp(u_samples, 2.0, 20.0));

      for (int i = 0; i < 20; i++) {
          if (i >= samples) break;
          float t = float(i) / max(1.0, float(samples - 1));
          float weight = 1.0 - t * 0.55;
          vec2 uv = v_texCoord - direction * t * u_strength;
          sum += texture(u_texture, clamp(uv, vec2(0.0), vec2(1.0))) * weight;
          weightSum += weight;
      }

      outColor = sum / max(weightSum, 0.0001);
  }
  `,
  uniforms: [
    {
      name: 'u_center',
      label: 'Blur Center (X, Y)',
      type: 'vec2',
      defaultValue: [0.5, 0.5],
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_strength',
      label: 'Zoom Strength',
      type: 'float',
      defaultValue: 0.18,
      min: 0.0,
      max: 0.65,
      step: 0.01,
    },
    {
      name: 'u_samples',
      label: 'Sample Quality',
      type: 'float',
      defaultValue: 12.0,
      min: 2.0,
      max: 20.0,
      step: 1.0,
    },
  ],
};

export const EFFECT_WATER_RIPPLE = {
  id: 'water-ripple',
  name: 'Water Ripple',
  description: 'Concentric refraction waves with highlights and radial falloff.',
  sourceUrl: 'https://www.shadertoy.com/view/wdtyDH',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform vec2 u_center;
  uniform float u_time;
  uniform float u_amplitude;
  uniform float u_frequency;
  uniform float u_speed;
  uniform float u_decay;
  uniform float u_highlight;

  void main() {
      vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
      vec2 delta = (v_texCoord - u_center) * aspect;
      float distanceFromCenter = length(delta);
      vec2 direction = delta / max(distanceFromCenter, 0.0001);
      float phase = distanceFromCenter * u_frequency - u_time * u_speed;
      float envelope = exp(-distanceFromCenter * u_decay);
      float wave = sin(phase) * envelope;
      float slope = cos(phase) * envelope;

      vec2 offset = direction * wave * u_amplitude / aspect;
      vec2 uv = clamp(v_texCoord + offset, vec2(0.0), vec2(1.0));
      vec4 color = texture(u_texture, uv);
      color.rgb += vec3(max(slope, 0.0) * u_highlight * 0.18);
      color.rgb -= vec3(max(-slope, 0.0) * u_highlight * 0.08);
      outColor = color;
  }
  `,
  uniforms: [
    {
      name: 'u_center',
      label: 'Ripple Center (X, Y)',
      type: 'vec2',
      defaultValue: [0.5, 0.5],
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_amplitude',
      label: 'Refraction Strength',
      type: 'float',
      defaultValue: 0.018,
      min: 0.0,
      max: 0.08,
      step: 0.001,
    },
    {
      name: 'u_frequency',
      label: 'Ring Frequency',
      type: 'float',
      defaultValue: 42.0,
      min: 4.0,
      max: 100.0,
      step: 0.5,
    },
    {
      name: 'u_speed',
      label: 'Ripple Speed',
      type: 'float',
      defaultValue: 5.0,
      min: -15.0,
      max: 15.0,
      step: 0.1,
    },
    {
      name: 'u_decay',
      label: 'Distance Falloff',
      type: 'float',
      defaultValue: 2.2,
      min: 0.0,
      max: 8.0,
      step: 0.01,
    },
    {
      name: 'u_highlight',
      label: 'Water Highlight',
      type: 'float',
      defaultValue: 0.45,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_CUBE_PARTY = {
  id: 'cube-party',
  name: 'Cube Party',
  description: 'An animated grid of pseudo-3D texture-mapped cubes.',
  sourceUrl: 'https://www.youtube.com/watch?v=BXI94DFzsRQ&t=606s',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_grid;
  uniform float u_cubeSize;
  uniform float u_perspective;
  uniform float u_motion;
  uniform float u_depth;
  uniform float u_edgeGlow;

  mat2 rotate2d(float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return mat2(c, -s, s, c);
  }

  float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
  }

  float boxMask(vec2 p, vec2 size, float feather) {
      vec2 distanceToEdge = abs(p) - size;
      float signedDistance = length(max(distanceToEdge, 0.0)) +
                             min(max(distanceToEdge.x, distanceToEdge.y), 0.0);
      return 1.0 - smoothstep(-feather, feather, signedDistance);
  }

  void main() {
      float aspect = u_resolution.x / max(u_resolution.y, 1.0);
      float rows = max(1.0, floor(u_grid));
      float columns = max(1.0, floor(rows * aspect + 0.5));
      vec2 gridSize = vec2(columns, rows);
      vec2 gridUv = v_texCoord * gridSize;
      vec2 cellId = floor(gridUv);
      vec2 localUv = fract(gridUv);
      vec2 p = localUv * 2.0 - 1.0;

      float seed = hash21(cellId);
      float phase = u_time * u_motion + seed * 6.28318530718;
      float pulse = sin(phase) * 0.5 + 0.5;
      float angle = (seed - 0.5) * 0.32 + sin(phase) * 0.16;
      float size = clamp(u_cubeSize + pulse * 0.05, 0.28, 0.88);
      float depth = (0.035 + pulse * 0.075 * u_depth) * clamp(u_perspective, 0.5, 3.5);
      vec2 depthOffset = vec2(depth, -depth * 0.72);
      vec2 rotatedFront = rotate2d(angle) * p;
      vec2 rotatedBack = rotate2d(angle) * (p - depthOffset);
      float backMask = boxMask(rotatedBack, vec2(size), 0.018);
      float frontMask = boxMask(rotatedFront, vec2(size), 0.018);
      float sideMask = max(backMask - frontMask, 0.0);

      vec2 faceUv = clamp(rotatedFront / (size * 2.0) + 0.5, vec2(0.0), vec2(1.0));
      vec2 sourceUv = (cellId + faceUv) / gridSize;
      vec4 face = texture(u_texture, clamp(sourceUv, vec2(0.0), vec2(1.0)));
      vec4 background = texture(u_texture, v_texCoord);
      float edgeDistance = min(min(faceUv.x, 1.0 - faceUv.x), min(faceUv.y, 1.0 - faceUv.y));
      float edge = 1.0 - smoothstep(0.0, 0.035, edgeDistance);
      vec3 edgeColor = mix(vec3(0.16, 0.35, 1.0), vec3(0.95, 0.12, 0.75), seed) *
                       edge * u_edgeGlow * (0.65 + pulse * 0.35);
      vec3 sideColor = face.rgb * mix(vec3(0.18, 0.25, 0.42), vec3(0.42, 0.16, 0.36), seed);
      vec3 scene = background.rgb * 0.035;
      scene = mix(scene, sideColor, sideMask);
      scene = mix(scene, face.rgb * (0.88 + pulse * 0.12) + edgeColor, frontMask);
      outColor = vec4(scene, face.a);
  }
  `,
  uniforms: [
    {
      name: 'u_grid',
      label: 'Grid Rows',
      type: 'float',
      defaultValue: 5.0,
      min: 2.0,
      max: 12.0,
      step: 1.0,
    },
    {
      name: 'u_cubeSize',
      label: 'Cube Size',
      type: 'float',
      defaultValue: 0.62,
      min: 0.3,
      max: 0.9,
      step: 0.01,
    },
    {
      name: 'u_motion',
      label: 'Party Motion',
      type: 'float',
      defaultValue: 1.1,
      min: -4.0,
      max: 4.0,
      step: 0.01,
    },
    {
      name: 'u_depth',
      label: 'Cube Depth',
      type: 'float',
      defaultValue: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
    },
    {
      name: 'u_perspective',
      label: 'Perspective',
      type: 'float',
      defaultValue: 1.9,
      min: 0.5,
      max: 3.5,
      step: 0.01,
    },
    {
      name: 'u_edgeGlow',
      label: 'Edge Glow',
      type: 'float',
      defaultValue: 0.8,
      min: 0.0,
      max: 2.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_PIXEL_SORT = {
  id: 'pixel-sort',
  name: 'Pixel Sort Melt',
  description: 'Brightness-gated directional pixel streaks inspired by glitch sorting.',
  sourceUrl: 'https://moshpro.app/',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_threshold;
  uniform float u_amount;
  uniform float u_direction;
  uniform float u_jitter;

  float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
  }

  void main() {
      vec4 original = texture(u_texture, v_texCoord);
      vec2 axis = mix(vec2(1.0, 0.0), vec2(0.0, 1.0), step(0.5, u_direction));
      float lane = dot(v_texCoord * u_resolution, vec2(axis.y, axis.x));
      float randomShift = (hash21(vec2(floor(lane / 3.0), 4.2)) - 0.5) * u_jitter;
      vec4 accumulator = vec4(0.0);
      float total = 0.0;

      for (int i = 0; i < 24; i++) {
          float t = float(i) / 23.0;
          vec2 uv = v_texCoord - axis * (t * u_amount + randomShift * 0.02);
          uv = clamp(uv, vec2(0.0), vec2(1.0));
          vec4 sampleColor = texture(u_texture, uv);
          float luma = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
          float gate = smoothstep(u_threshold - 0.08, u_threshold + 0.08, luma);
          float weight = gate * (1.0 - t * 0.65);
          accumulator += sampleColor * weight;
          total += weight;
      }

      vec4 sorted = total > 0.001 ? accumulator / total : original;
      float sourceLuma = dot(original.rgb, vec3(0.299, 0.587, 0.114));
      float sourceGate = smoothstep(u_threshold - 0.12, u_threshold + 0.12, sourceLuma);
      outColor = mix(original, sorted, sourceGate);
  }
  `,
  uniforms: [
    {
      name: 'u_threshold',
      label: 'Brightness Threshold',
      type: 'float',
      defaultValue: 0.48,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_amount',
      label: 'Melt Length',
      type: 'float',
      defaultValue: 0.22,
      min: 0.0,
      max: 0.8,
      step: 0.01,
    },
    {
      name: 'u_direction',
      label: 'Direction (Horizontal / Vertical)',
      type: 'float',
      defaultValue: 1.0,
      min: 0.0,
      max: 1.0,
      step: 1.0,
    },
    {
      name: 'u_jitter',
      label: 'Lane Jitter',
      type: 'float',
      defaultValue: 0.35,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
};

export const EFFECT_CRT = {
  id: 'crt-display',
  name: 'CRT Display',
  description: 'Curved tube display with scanlines, RGB grille and vignette.',
  sourceUrl: 'https://moshpro.app/',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_curvature;
  uniform float u_scanlines;
  uniform float u_grille;
  uniform float u_vignette;
  uniform float u_glow;

  void main() {
      vec2 p = v_texCoord * 2.0 - 1.0;
      vec2 curved = p * (1.0 + dot(p, p) * u_curvature);
      vec2 uv = curved * 0.5 + 0.5;
      float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
      uv = clamp(uv, vec2(0.0), vec2(1.0));

      vec3 color = texture(u_texture, uv).rgb;
      vec2 px = 1.0 / max(u_resolution, vec2(1.0));
      vec3 bloom = texture(u_texture, clamp(uv + vec2(px.x * 2.0, 0.0), vec2(0.0), vec2(1.0))).rgb;
      bloom += texture(u_texture, clamp(uv - vec2(px.x * 2.0, 0.0), vec2(0.0), vec2(1.0))).rgb;
      color += bloom * u_glow * 0.18;

      float scan = 0.82 + 0.18 * sin(uv.y * u_resolution.y * 3.14159265);
      color *= mix(1.0, scan, u_scanlines);

      float triad = mod(floor(uv.x * u_resolution.x), 3.0);
      vec3 mask = triad < 1.0 ? vec3(1.0, 0.72, 0.72) :
                  triad < 2.0 ? vec3(0.72, 1.0, 0.72) : vec3(0.72, 0.72, 1.0);
      color *= mix(vec3(1.0), mask, u_grille);

      float vignette = pow(clamp(1.0 - dot(p * 0.72, p * 0.72), 0.0, 1.0), 0.35 + u_vignette);
      outColor = vec4(color * vignette * inside, 1.0);
  }
  `,
  uniforms: [
    {
      name: 'u_curvature',
      label: 'Screen Curvature',
      type: 'float',
      defaultValue: 0.08,
      min: 0.0,
      max: 0.35,
      step: 0.001,
    },
    {
      name: 'u_scanlines',
      label: 'Scanline Strength',
      type: 'float',
      defaultValue: 0.55,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_grille',
      label: 'RGB Grille',
      type: 'float',
      defaultValue: 0.32,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_vignette',
      label: 'Vignette',
      type: 'float',
      defaultValue: 0.65,
      min: 0.0,
      max: 2.0,
      step: 0.01,
    },
    {
      name: 'u_glow',
      label: 'Phosphor Glow',
      type: 'float',
      defaultValue: 0.38,
      min: 0.0,
      max: 1.5,
      step: 0.01,
    },
  ],
};

export const EFFECT_MIRROR_TILE = {
  id: 'mirror-tile',
  name: 'Mirror Tile',
  description: 'Animated mirrored tiling with rotation and staggered rows.',
  sourceUrl: 'https://moshpro.app/',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_tiles;
  uniform float u_angle;
  uniform float u_speed;
  uniform float u_stagger;

  mat2 rotate2d(float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return mat2(c, -s, s, c);
  }

  void main() {
      vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
      vec2 p = (v_texCoord - 0.5) * aspect;
      p = rotate2d(u_angle) * p;
      p.x += floor((p.y + 2.0) * u_tiles) * u_stagger / max(u_tiles, 1.0);
      p.x += u_time * u_speed;
      vec2 tiled = p * max(u_tiles, 1.0);
      vec2 uv = 1.0 - abs(mod(tiled, 2.0) - 1.0);
      outColor = texture(u_texture, clamp(uv, vec2(0.0), vec2(1.0)));
  }
  `,
  uniforms: [
    {
      name: 'u_tiles',
      label: 'Tile Count',
      type: 'float',
      defaultValue: 4.0,
      min: 1.0,
      max: 16.0,
      step: 1.0,
    },
    {
      name: 'u_angle',
      label: 'Tile Angle',
      type: 'float',
      defaultValue: 0.0,
      min: -3.14,
      max: 3.14,
      step: 0.01,
    },
    {
      name: 'u_speed',
      label: 'Slide Speed',
      type: 'float',
      defaultValue: 0.04,
      min: -0.5,
      max: 0.5,
      step: 0.01,
    },
    {
      name: 'u_stagger',
      label: 'Row Stagger',
      type: 'float',
      defaultValue: 0.5,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_LIQUID_DISTORTION = {
  id: 'liquid-distortion',
  name: 'Liquid Distortion',
  description: 'Layered fluid domain warping with chromatic refraction.',
  sourceUrl: 'https://www.youtube.com/watch?v=LPzx_QnqC68',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_scale;
  uniform float u_strength;
  uniform float u_speed;
  uniform float u_dispersion;
  uniform float u_mixIntensity;

  float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
      vec2 id = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(id);
      float b = hash21(id + vec2(1.0, 0.0));
      float c = hash21(id + vec2(0.0, 1.0));
      float d = hash21(id + vec2(1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 4; i++) {
          value += valueNoise(p) * amplitude;
          p = p * 2.03 + vec2(13.1, 7.7);
          amplitude *= 0.5;
      }
      return value;
  }

  void main() {
      vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
      vec2 p = v_texCoord * aspect * max(u_scale, 0.1);
      float time = u_time * u_speed;
      vec2 flow = vec2(
          fbm(p + vec2(time, -time * 0.37)),
          fbm(p.yx + vec2(-time * 0.43, time * 0.71))
      ) - 0.5;
      vec2 secondary = vec2(
          sin((p.y + flow.y * 2.0) * 3.14159 + time),
          cos((p.x + flow.x * 2.0) * 3.14159 - time)
      ) * 0.22;
      vec2 offset = (flow + secondary) * u_strength / aspect;
      vec2 uv = clamp(v_texCoord + offset, vec2(0.0), vec2(1.0));
      vec4 original = texture(u_texture, v_texCoord);
      vec2 chroma = normalize(offset + vec2(0.0001)) * u_dispersion;
      vec3 liquid = vec3(
          texture(u_texture, clamp(uv + chroma, vec2(0.0), vec2(1.0))).r,
          texture(u_texture, uv).g,
          texture(u_texture, clamp(uv - chroma, vec2(0.0), vec2(1.0))).b
      );
      outColor = vec4(mix(original.rgb, liquid, u_mixIntensity), original.a);
  }
  `,
  uniforms: [
    {
      name: 'u_scale',
      label: 'Fluid Scale',
      type: 'float',
      defaultValue: 3.2,
      min: 0.5,
      max: 10.0,
      step: 0.01,
    },
    {
      name: 'u_strength',
      label: 'Warp Strength',
      type: 'float',
      defaultValue: 0.055,
      min: 0.0,
      max: 0.2,
      step: 0.001,
    },
    {
      name: 'u_speed',
      label: 'Flow Speed',
      type: 'float',
      defaultValue: 0.32,
      min: -2.0,
      max: 2.0,
      step: 0.01,
    },
    {
      name: 'u_dispersion',
      label: 'Color Refraction',
      type: 'float',
      defaultValue: 0.006,
      min: 0.0,
      max: 0.03,
      step: 0.001,
    },
    {
      name: 'u_mixIntensity',
      label: 'Mix Blend',
      type: 'float',
      defaultValue: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_FRACTAL_GLASS = {
  id: 'fractal-glass',
  name: 'Fractal Glass',
  description: 'Animated Voronoi glass shards with beveled spectral edges.',
  sourceUrl: 'https://www.youtube.com/watch?v=IMYPP9NXxac',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_cells;
  uniform float u_refraction;
  uniform float u_rotation;
  uniform float u_bevel;
  uniform float u_speed;

  vec2 hash22(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.xx + p3.yz) * p3.zy);
  }

  mat2 rotate2d(float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return mat2(c, -s, s, c);
  }

  void main() {
      vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
      vec2 p = (v_texCoord - 0.5) * aspect;
      p = rotate2d(u_rotation) * p * max(u_cells, 1.0);
      vec2 id = floor(p);
      vec2 local = fract(p);
      float nearest = 10.0;
      float secondNearest = 10.0;
      vec2 nearestVector = vec2(0.0);

      for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
              vec2 neighbor = vec2(float(x), float(y));
              vec2 point = hash22(id + neighbor);
              point = 0.5 + 0.42 * sin(u_time * u_speed + 6.2831853 * point);
              vec2 difference = neighbor + point - local;
              float distanceToPoint = dot(difference, difference);
              if (distanceToPoint < nearest) {
                  secondNearest = nearest;
                  nearest = distanceToPoint;
                  nearestVector = difference;
              } else if (distanceToPoint < secondNearest) {
                  secondNearest = distanceToPoint;
              }
          }
      }

      float border = sqrt(secondNearest) - sqrt(nearest);
      vec2 normal = normalize(nearestVector + vec2(0.0001));
      float edge = 1.0 - smoothstep(0.0, max(u_bevel, 0.001), border);
      vec2 offset = normal * u_refraction * (0.3 + edge * 1.7) / aspect;
      vec2 uv = clamp(v_texCoord + offset, vec2(0.0), vec2(1.0));
      vec3 color = vec3(
          texture(u_texture, clamp(uv + offset * 0.18, vec2(0.0), vec2(1.0))).r,
          texture(u_texture, uv).g,
          texture(u_texture, clamp(uv - offset * 0.18, vec2(0.0), vec2(1.0))).b
      );
      vec3 spectral = 0.5 + 0.5 * cos(6.2831853 * (edge + vec3(0.0, 0.33, 0.67)));
      outColor = vec4(color + spectral * edge * 0.28, 1.0);
  }
  `,
  uniforms: [
    {
      name: 'u_cells',
      label: 'Shard Density',
      type: 'float',
      defaultValue: 8.0,
      min: 2.0,
      max: 24.0,
      step: 1.0,
    },
    {
      name: 'u_refraction',
      label: 'Glass Refraction',
      type: 'float',
      defaultValue: 0.018,
      min: 0.0,
      max: 0.08,
      step: 0.001,
    },
    {
      name: 'u_rotation',
      label: 'Shard Rotation',
      type: 'float',
      defaultValue: 0.0,
      min: -3.14,
      max: 3.14,
      step: 0.01,
    },
    {
      name: 'u_bevel',
      label: 'Bevel Width',
      type: 'float',
      defaultValue: 0.08,
      min: 0.005,
      max: 0.35,
      step: 0.001,
    },
    {
      name: 'u_speed',
      label: 'Glass Motion',
      type: 'float',
      defaultValue: 0.22,
      min: -2.0,
      max: 2.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_TURBULENT_DISSOLVE = {
  id: 'turbulent-dissolve',
  name: 'Turbulent Dissolve',
  description: 'Procedural disintegration with animated burn edges.',
  sourceUrl: 'https://www.youtube.com/watch?v=s6s3rOoEluI',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_progress;
  uniform float u_scale;
  uniform float u_edgeWidth;
  uniform vec3 u_edgeColor;
  uniform float u_speed;

  float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                 mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 5; i++) {
          value += noise(p) * amplitude;
          p = p * 2.01 + 11.7;
          amplitude *= 0.5;
      }
      return value;
  }

  void main() {
      vec4 source = texture(u_texture, v_texCoord);
      vec2 p = v_texCoord * max(u_scale, 0.1);
      float field = fbm(p + vec2(u_time * u_speed, -u_time * u_speed * 0.37));
      float threshold = clamp(u_progress, 0.0, 1.0);
      float body = smoothstep(threshold - 0.025, threshold + 0.025, field);
      float edge = smoothstep(threshold - u_edgeWidth, threshold, field) - body;
      vec3 background = source.rgb * 0.025;
      vec3 color = mix(background, source.rgb, body);
      color += u_edgeColor * edge * (1.2 + edge);
      outColor = vec4(color, source.a);
  }
  `,
  uniforms: [
    {
      name: 'u_progress',
      label: 'Dissolve Progress',
      type: 'float',
      defaultValue: 0.45,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_scale',
      label: 'Turbulence Scale',
      type: 'float',
      defaultValue: 5.0,
      min: 0.5,
      max: 20.0,
      step: 0.1,
    },
    {
      name: 'u_edgeWidth',
      label: 'Burn Edge Width',
      type: 'float',
      defaultValue: 0.12,
      min: 0.01,
      max: 0.35,
      step: 0.01,
    },
    {
      name: 'u_edgeColor',
      label: 'Burn Edge Color',
      type: 'color',
      defaultValue: '#ff5a1f',
    },
    {
      name: 'u_speed',
      label: 'Turbulence Motion',
      type: 'float',
      defaultValue: 0.08,
      min: -1.0,
      max: 1.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_ASCII_VISION = {
  id: 'ascii-vision',
  name: 'ASCII Vision',
  description: 'Procedural character mosaic sampled from source luminance.',
  sourceUrl: 'https://www.youtube.com/watch?v=4m63eG05knw',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_cellSize;
  uniform float u_contrast;
  uniform vec3 u_inkColor;
  uniform float u_colorMix;
  uniform float u_background;

  float segment(vec2 p, vec2 a, vec2 b, float width) {
      vec2 pa = p - a;
      vec2 ba = b - a;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      return 1.0 - smoothstep(width, width + 0.08, length(pa - ba * h));
  }

  float glyph(vec2 p, float level) {
      float dotGlyph = 1.0 - smoothstep(0.08, 0.18, length(p));
      float dash = segment(p, vec2(-0.3, 0.0), vec2(0.3, 0.0), 0.08);
      float crossGlyph = max(segment(p, vec2(-0.28, -0.28), vec2(0.28, 0.28), 0.07),
                             segment(p, vec2(-0.28, 0.28), vec2(0.28, -0.28), 0.07));
      float plusGlyph = max(segment(p, vec2(-0.32, 0.0), vec2(0.32, 0.0), 0.07),
                            segment(p, vec2(0.0, -0.36), vec2(0.0, 0.36), 0.07));
      float ring = 1.0 - smoothstep(0.05, 0.12, abs(length(p) - 0.3));
      float dense = max(ring, plusGlyph);
      if (level < 0.18) return dotGlyph;
      if (level < 0.36) return dash;
      if (level < 0.54) return crossGlyph;
      if (level < 0.72) return plusGlyph;
      if (level < 0.88) return ring;
      return dense;
  }

  void main() {
      float size = max(u_cellSize, 3.0);
      vec2 cellCount = u_resolution / size;
      vec2 cellId = floor(v_texCoord * cellCount);
      vec2 cellUv = fract(v_texCoord * cellCount) - 0.5;
      vec2 sampleUv = (cellId + 0.5) / cellCount;
      vec4 source = texture(u_texture, clamp(sampleUv, vec2(0.0), vec2(1.0)));
      float luma = dot(source.rgb, vec3(0.299, 0.587, 0.114));
      luma = clamp((luma - 0.5) * u_contrast + 0.5, 0.0, 1.0);
      float mask = glyph(cellUv, luma);
      vec3 ink = mix(u_inkColor, source.rgb, u_colorMix);
      vec3 background = source.rgb * u_background;
      outColor = vec4(mix(background, ink, mask), source.a);
  }
  `,
  uniforms: [
    {
      name: 'u_cellSize',
      label: 'Character Size',
      type: 'float',
      defaultValue: 12.0,
      min: 4.0,
      max: 40.0,
      step: 1.0,
    },
    {
      name: 'u_contrast',
      label: 'Luminance Contrast',
      type: 'float',
      defaultValue: 1.4,
      min: 0.4,
      max: 3.0,
      step: 0.01,
    },
    {
      name: 'u_inkColor',
      label: 'ASCII Ink',
      type: 'color',
      defaultValue: '#73ffb2',
    },
    {
      name: 'u_colorMix',
      label: 'Source Color',
      type: 'float',
      defaultValue: 0.35,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_background',
      label: 'Background Visibility',
      type: 'float',
      defaultValue: 0.08,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
};

export const EFFECT_HOLOGRAPHIC_CHROME = {
  id: 'holographic-chrome',
  name: 'Holographic Chrome',
  description: 'Metallic relief shading with animated spectral highlights.',
  sourceUrl: 'https://digitalsynopsis.com/design/graphic-design-trends-2026/',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_relief;
  uniform float u_spectrum;
  uniform float u_metallic;
  uniform float u_shimmer;
  uniform float u_mixIntensity;

  float luma(vec2 uv) {
      return dot(texture(u_texture, clamp(uv, vec2(0.0), vec2(1.0))).rgb,
                 vec3(0.299, 0.587, 0.114));
  }

  void main() {
      vec2 px = 1.0 / max(u_resolution, vec2(1.0));
      float left = luma(v_texCoord - vec2(px.x, 0.0));
      float right = luma(v_texCoord + vec2(px.x, 0.0));
      float down = luma(v_texCoord - vec2(0.0, px.y));
      float up = luma(v_texCoord + vec2(0.0, px.y));
      vec3 normal = normalize(vec3((left - right) * u_relief, (down - up) * u_relief, 1.0));
      vec3 light = normalize(vec3(sin(u_time * u_shimmer), cos(u_time * u_shimmer * 0.73), 0.8));
      float diffuse = dot(normal, light) * 0.5 + 0.5;
      float specular = pow(max(dot(reflect(-light, normal), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);
      float band = diffuse * u_spectrum + v_texCoord.y * 0.8 + u_time * u_shimmer * 0.18;
      vec3 spectral = 0.5 + 0.5 * cos(6.2831853 * (band + vec3(0.0, 0.33, 0.67)));
      vec4 source = texture(u_texture, v_texCoord);
      vec3 chrome = mix(vec3(diffuse), spectral, clamp(u_metallic, 0.0, 1.0));
      chrome = chrome * (0.45 + source.rgb * 0.75) + specular * 0.8;
      outColor = vec4(mix(source.rgb, chrome, u_mixIntensity), source.a);
  }
  `,
  uniforms: [
    {
      name: 'u_relief',
      label: 'Surface Relief',
      type: 'float',
      defaultValue: 8.0,
      min: 0.0,
      max: 30.0,
      step: 0.1,
    },
    {
      name: 'u_spectrum',
      label: 'Spectrum Bands',
      type: 'float',
      defaultValue: 2.4,
      min: 0.0,
      max: 8.0,
      step: 0.01,
    },
    {
      name: 'u_metallic',
      label: 'Metallic Color',
      type: 'float',
      defaultValue: 0.82,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_shimmer',
      label: 'Shimmer Speed',
      type: 'float',
      defaultValue: 0.45,
      min: -2.0,
      max: 2.0,
      step: 0.01,
    },
    {
      name: 'u_mixIntensity',
      label: 'Mix Blend',
      type: 'float',
      defaultValue: 0.88,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_THERMAL = {
  id: 'thermal',
  name: 'Thermal Camera',
  description: 'Infrared heat map simulator matching brightness to thermal colors.',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform float u_spread;
  uniform float u_mixIntensity;

  vec3 getThermalColor(float val) {
      val = clamp(val * u_spread, 0.0, 1.0);
      vec3 blue   = vec3(0.0, 0.0, 0.5);
      vec3 purple = vec3(0.5, 0.0, 0.5);
      vec3 red    = vec3(0.9, 0.0, 0.1);
      vec3 orange = vec3(1.0, 0.5, 0.0);
      vec3 yellow = vec3(1.0, 0.9, 0.0);
      vec3 white  = vec3(1.0, 1.0, 1.0);

      if (val < 0.2) return mix(blue, purple, val / 0.2);
      else if (val < 0.4) return mix(purple, red, (val - 0.2) / 0.2);
      else if (val < 0.6) return mix(red, orange, (val - 0.4) / 0.2);
      else if (val < 0.8) return mix(orange, yellow, (val - 0.6) / 0.2);
      else return mix(yellow, white, (val - 0.8) / 0.2);
  }

  void main() {
      vec4 texColor = texture(u_texture, v_texCoord);
      float luma = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
      vec3 thermal = getThermalColor(luma);
      outColor = vec4(mix(texColor.rgb, thermal, u_mixIntensity), texColor.a);
  }
  `,
  uniforms: [
    {
      name: 'u_spread',
      label: 'Thermal Spread',
      type: 'float',
      defaultValue: 1.0,
      min: 0.5,
      max: 2.0,
      step: 0.05,
    },
    {
      name: 'u_mixIntensity',
      label: 'Mix Blend',
      type: 'float',
      defaultValue: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
};

export const EFFECT_FILM_GRAIN = {
  id: 'film-grain',
  name: 'Vintage Film & Grain',
  description: 'Retro Super 8/16mm film filter with dynamic noise, vignettes, and scratches.',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_grainIntensity;
  uniform float u_scratchFrequency;
  uniform float u_vignetteAmount;

  float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
      vec4 texColor = texture(u_texture, v_texCoord);
      
      // 1. Dynamic Film Grain
      vec2 uvNoise = v_texCoord + vec2(sin(u_time * 1.8), cos(u_time * 2.5));
      float noise = hash(uvNoise * 100.0) - 0.5;
      texColor.rgb += noise * u_grainIntensity;
      
      // 2. Vertical Scratches
      float scratchX = hash(vec2(floor(u_time * 6.0), 12.0));
      float scratchWidth = 0.0015;
      float scratch = step(scratchX, v_texCoord.x) * (1.0 - step(scratchX + scratchWidth, v_texCoord.x));
      
      float scratchChance = step(1.0 - u_scratchFrequency, hash(vec2(floor(u_time * 8.0), 99.0)));
      texColor.rgb = mix(texColor.rgb, vec3(0.85), scratch * scratchChance * 0.5);
      
      // 3. Vignette
      vec2 uvDist = v_texCoord - vec2(0.5);
      float vignette = smoothstep(0.8, 0.4, length(uvDist) * u_vignetteAmount);
      texColor.rgb *= vignette;
      
      outColor = texColor;
  }
  `,
  uniforms: [
    {
      name: 'u_grainIntensity',
      label: 'Grain Amount',
      type: 'float',
      defaultValue: 0.15,
      min: 0.0,
      max: 0.5,
      step: 0.01,
    },
    {
      name: 'u_scratchFrequency',
      label: 'Scratch Density',
      type: 'float',
      defaultValue: 0.3,
      min: 0.0,
      max: 1.0,
      step: 0.05,
    },
    {
      name: 'u_vignetteAmount',
      label: 'Vignette Outer',
      type: 'float',
      defaultValue: 0.8,
      min: 0.0,
      max: 1.5,
      step: 0.05,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_BLOOM = {
  id: 'bloom',
  name: 'Anamorphic Glow / Bloom',
  description: 'Diffuse glowing highlights mimicking a retro dream camera.',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform float u_threshold;
  uniform float u_radius;
  uniform float u_glowIntensity;

  void main() {
      vec4 original = texture(u_texture, v_texCoord);
      
      vec3 bloom = vec3(0.0);
      float weights[5] = float[](0.227, 0.194, 0.121, 0.054, 0.016);
      vec2 offset = vec2(u_radius * 0.003);
      
      bloom += texture(u_texture, v_texCoord).rgb * weights[0];
      for (int i = 1; i < 5; i++) {
          float fi = float(i);
          bloom += texture(u_texture, v_texCoord + vec2(fi * offset.x, 0.0)).rgb * weights[i];
          bloom += texture(u_texture, v_texCoord - vec2(fi * offset.x, 0.0)).rgb * weights[i];
          bloom += texture(u_texture, v_texCoord + vec2(0.0, fi * offset.y)).rgb * weights[i];
          bloom += texture(u_texture, v_texCoord - vec2(0.0, fi * offset.y)).rgb * weights[i];
      }
      
      float luminance = dot(bloom, vec3(0.299, 0.587, 0.114));
      vec3 brightColor = bloom * smoothstep(u_threshold - 0.1, u_threshold + 0.1, luminance);
      
      outColor = vec4(original.rgb + brightColor * u_glowIntensity, original.a);
  }
  `,
  uniforms: [
    {
      name: 'u_threshold',
      label: 'Bright Cutoff',
      type: 'float',
      defaultValue: 0.5,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
    {
      name: 'u_radius',
      label: 'Glow Spread',
      type: 'float',
      defaultValue: 3.0,
      min: 0.5,
      max: 8.0,
      step: 0.1,
    },
    {
      name: 'u_glowIntensity',
      label: 'Glow Intensity',
      type: 'float',
      defaultValue: 1.2,
      min: 0.0,
      max: 3.0,
      step: 0.1,
    },
  ],
};

export const EFFECT_SPEED_LINES = {
  id: 'speed-lines',
  name: 'Anime Speed Lines',
  description: 'Fast-moving radial lines framing the screen edges for high-energy motion.',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_density;
  uniform float u_centerSize;
  uniform float u_speed;
  uniform float u_mixIntensity;

  float noise1D(float x) {
      return fract(sin(x * 12.9898) * 43758.5453);
  }

  void main() {
      vec4 texColor = texture(u_texture, v_texCoord);
      vec2 centered = v_texCoord - 0.5;
      
      float r = length(centered);
      float angle = atan(centered.y, centered.x);
      
      float lineVal = noise1D(floor(angle * u_density) + floor(u_time * u_speed));
      float centerMask = smoothstep(u_centerSize, u_centerSize + 0.15, r);
      float lineIntensity = step(0.65, lineVal) * centerMask;
      
      vec3 finalColor = mix(texColor.rgb, vec3(0.0), lineIntensity * u_mixIntensity);
      outColor = vec4(finalColor, texColor.a);
  }
  `,
  uniforms: [
    {
      name: 'u_density',
      label: 'Line Density',
      type: 'float',
      defaultValue: 150.0,
      min: 50.0,
      max: 300.0,
      step: 5.0,
    },
    {
      name: 'u_centerSize',
      label: 'Clear Center Size',
      type: 'float',
      defaultValue: 0.25,
      min: 0.05,
      max: 0.45,
      step: 0.01,
    },
    {
      name: 'u_speed',
      label: 'Flicker Speed',
      type: 'float',
      defaultValue: 18.0,
      min: 5.0,
      max: 40.0,
      step: 1.0,
    },
    {
      name: 'u_mixIntensity',
      label: 'Lines Opacity',
      type: 'float',
      defaultValue: 0.75,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const EFFECT_COLOR_ISOLATION = {
  id: 'color-isolation',
  name: 'Selective Color Isolation',
  description: 'Isolates a targeted color value while desaturating the rest of the image.',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform vec3 u_targetColor;
  uniform float u_tolerance;
  uniform float u_softness;
  uniform float u_mixIntensity;

  vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
      vec4 texColor = texture(u_texture, v_texCoord);
      vec3 hsv = rgb2hsv(texColor.rgb);
      vec3 targetHSV = rgb2hsv(u_targetColor);
      
      float hueDist = abs(hsv.x - targetHSV.x);
      if (hueDist > 0.5) hueDist = 1.0 - hueDist;
      
      float mask = smoothstep(u_tolerance + u_softness, u_tolerance, hueDist);
      
      vec3 isolatedHSV = vec3(hsv.x, hsv.y * mask, hsv.z);
      vec3 isolatedRGB = hsv2rgb(isolatedHSV);
      
      outColor = vec4(mix(texColor.rgb, isolatedRGB, u_mixIntensity), texColor.a);
  }
  `,
  uniforms: [
    {
      name: 'u_targetColor',
      label: 'Color to Keep',
      type: 'color',
      defaultValue: '#ff0000',
    },
    {
      name: 'u_tolerance',
      label: 'Hue Tolerance',
      type: 'float',
      defaultValue: 0.08,
      min: 0.01,
      max: 0.5,
      step: 0.01,
    },
    {
      name: 'u_softness',
      label: 'Edge Softness',
      type: 'float',
      defaultValue: 0.12,
      min: 0.01,
      max: 0.3,
      step: 0.01,
    },
    {
      name: 'u_mixIntensity',
      label: 'Mix Blend',
      type: 'float',
      defaultValue: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
};

export const EFFECT_VAPORWAVE_TRIP = {
  id: 'vaporwave-trip',
  name: 'Vaporwave Psychedelic Trip',
  description: 'Liquid sine distortion combined with cyclic neon color shifting.',
  fragmentShader: `#version 300 es
  precision highp float;

  in vec2 v_texCoord;
  out vec4 outColor;

  uniform sampler2D u_texture;
  uniform float u_time;
  uniform float u_rippleFreq;
  uniform float u_rippleAmp;
  uniform float u_colorSpeed;
  uniform float u_mixIntensity;

  void main() {
      vec2 uv = v_texCoord;
      float rippleX = sin(uv.y * u_rippleFreq + u_time) * u_rippleAmp;
      float rippleY = cos(uv.x * u_rippleFreq * 1.2 - u_time * 1.3) * u_rippleAmp;
      uv += vec2(rippleX, rippleY);
      uv = clamp(uv, vec2(0.0), vec2(1.0));
      
      vec4 texColor = texture(u_texture, uv);
      vec3 shiftColor = 0.5 + 0.5 * cos(u_time * u_colorSpeed + uv.xyx * 2.0 + vec3(0.0, 2.0, 4.0));
      vec3 finalRGB = mix(texColor.rgb, texColor.rgb * shiftColor * 1.6, u_mixIntensity);
      
      outColor = vec4(finalRGB, texColor.a);
  }
  `,
  uniforms: [
    {
      name: 'u_rippleFreq',
      label: 'Liquid Frequency',
      type: 'float',
      defaultValue: 12.0,
      min: 1.0,
      max: 30.0,
      step: 0.5,
    },
    {
      name: 'u_rippleAmp',
      label: 'Liquid Amplitude',
      type: 'float',
      defaultValue: 0.012,
      min: 0.0,
      max: 0.05,
      step: 0.001,
    },
    {
      name: 'u_colorSpeed',
      label: 'Color Cycle Speed',
      type: 'float',
      defaultValue: 2.5,
      min: 0.0,
      max: 8.0,
      step: 0.1,
    },
    {
      name: 'u_mixIntensity',
      label: 'Psychedelic Intensity',
      type: 'float',
      defaultValue: 0.65,
      min: 0.0,
      max: 1.0,
      step: 0.01,
    },
  ],
  isTimeDependent: true,
};

export const AVAILABLE_EFFECTS = {
  grayscale: EFFECT_GRAYSCALE,
  tint: EFFECT_TINT,
  'chromatic-aberration': EFFECT_CHROMATIC_ABERRATION,
  pixelate: EFFECT_PIXELATE,
  'wave-distortion': EFFECT_WAVE_DISTORTION,
  vhs: EFFECT_VHS,
  'bad-tv': EFFECT_BAD_TV,
  palettization: EFFECT_PALETTE,
  datamosh: EFFECT_DATA_MOSH,
  'halftone-print': EFFECT_HALFTONE,
  kaleidoscope: EFFECT_KALEIDOSCOPE,
  'neon-edge': EFFECT_NEON_EDGE,
  'radial-blur': EFFECT_RADIAL_BLUR,
  'water-ripple': EFFECT_WATER_RIPPLE,
  'cube-party': EFFECT_CUBE_PARTY,
  'pixel-sort': EFFECT_PIXEL_SORT,
  'crt-display': EFFECT_CRT,
  'mirror-tile': EFFECT_MIRROR_TILE,
  'liquid-distortion': EFFECT_LIQUID_DISTORTION,
  'fractal-glass': EFFECT_FRACTAL_GLASS,
  'turbulent-dissolve': EFFECT_TURBULENT_DISSOLVE,
  'ascii-vision': EFFECT_ASCII_VISION,
  'holographic-chrome': EFFECT_HOLOGRAPHIC_CHROME,
  thermal: EFFECT_THERMAL,
  'film-grain': EFFECT_FILM_GRAIN,
  bloom: EFFECT_BLOOM,
  'speed-lines': EFFECT_SPEED_LINES,
  'color-isolation': EFFECT_COLOR_ISOLATION,
  'vaporwave-trip': EFFECT_VAPORWAVE_TRIP,
};
