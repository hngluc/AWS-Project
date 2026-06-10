import { 
  VERTEX_SHADER_SOURCE, 
  PASSTHROUGH_FRAGMENT_SOURCE, 
  AVAILABLE_EFFECTS 
} from './shaders';

export class WebGLPipeline {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      throw new Error('WebGL 2 is not supported by your browser.');
    }
    this.gl = gl;
    this.startTime = performance.now();

    // Enable texture flipping by default for easy rendering
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.programCache = new Map();
    this.uniformLocationCache = new Map();
    this.vao = null;
    this.videoTexture = null;
    
    // Ping-pong framebuffers
    this.fboA = null;
    this.fboB = null;
    this.textureA = null;
    this.textureB = null;
    
    // Pipeline state
    this.width = 0;
    this.height = 0;
    this.activeEffects = [];

    this.initWebGLResources();

    if (options.width && options.height) {
      this.resize(options.width, options.height);
    }
  }

  /**
   * Compiles and caches all available shader programs and setups VAO.
   */
  initWebGLResources() {
    const gl = this.gl;

    // WebGL 2 requires a bound Vertex Array Object (VAO) to draw
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Create passthrough program
    this.passthroughProgram = this.createProgram(VERTEX_SHADER_SOURCE, PASSTHROUGH_FRAGMENT_SOURCE);

    // Pre-compile all available shader effects
    for (const [id, def] of Object.entries(AVAILABLE_EFFECTS)) {
      try {
        const program = this.createProgram(VERTEX_SHADER_SOURCE, def.fragmentShader);
        this.programCache.set(id, program);
      } catch (err) {
        console.error(`Failed to compile shader effect: ${id}`, err);
      }
    }

    // Initialize the video texture
    this.videoTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  /**
   * Resizes the canvas size and framebuffers.
   */
  resize(width, height) {
    if (this.width === width && this.height === height) return;
    
    this.width = width;
    this.height = height;

    // Set canvas dimensions
    this.canvas.width = width;
    this.canvas.height = height;

    this.recreateFramebuffers();
  }

  /**
   * Recreates FBOs when width/height changes.
   */
  recreateFramebuffers() {
    const gl = this.gl;

    // Clean up old framebuffers if they exist
    this.cleanupFramebuffers();

    // Helper to create an FBO and its attached texture
    const createFBO = () => {
      const texture = gl.createTexture();
      if (!texture) throw new Error('Failed to create FBO texture');
      
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      const fbo = gl.createFramebuffer();
      if (!fbo) throw new Error('Failed to create WebGL Framebuffer');

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`Framebuffer incomplete status: ${status}`);
      }

      return [fbo, texture];
    };

    [this.fboA, this.textureA] = createFBO();
    [this.fboB, this.textureB] = createFBO();

    // Reset bindings
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  cleanupFramebuffers() {
    const gl = this.gl;
    if (this.fboA) { gl.deleteFramebuffer(this.fboA); this.fboA = null; }
    if (this.fboB) { gl.deleteFramebuffer(this.fboB); this.fboB = null; }
    if (this.textureA) { gl.deleteTexture(this.textureA); this.textureA = null; }
    if (this.textureB) { gl.deleteTexture(this.textureB); this.textureB = null; }
  }

  /**
   * Updates the active effects list. Decouples React state from the render loop.
   */
  updateEffects(effects) {
    // Deep clone the effects array to avoid concurrent mutation issues
    this.activeEffects = JSON.parse(JSON.stringify(effects));
  }

  /**
   * Renders a frame. Takes the input source (HTML5 Video or Image).
   */
  render(source) {
    const gl = this.gl;

    let isReady = false;
    let sourceWidth = 0;
    let sourceHeight = 0;

    if (source instanceof HTMLVideoElement) {
      isReady = source.readyState >= source.HAVE_CURRENT_DATA;
      sourceWidth = source.videoWidth;
      sourceHeight = source.videoHeight;
    } else if (source instanceof HTMLImageElement) {
      isReady = source.complete && source.naturalWidth > 0;
      sourceWidth = source.naturalWidth;
      sourceHeight = source.naturalHeight;
    }

    if (!isReady) {
      return; // Wait until source is ready to process
    }

    // Auto-resize viewport and FBOs if source size does not match our current size
    if (sourceWidth > 0 && sourceHeight > 0 && 
        (this.width !== sourceWidth || this.height !== sourceHeight)) {
      this.resize(sourceWidth, sourceHeight);
    }

    if (this.width === 0 || this.height === 0) return;

    // 1. Upload source to texture
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    // 2. Set up variables for Multi-Pass (Ping-Pong) Loop
    const time = (performance.now() - this.startTime) / 1000.0;
    
    // Filter active effects
    const enabledEffects = this.activeEffects.filter(e => e.enabled);

    let currentSourceTexture = this.videoTexture;
    let currentFbo = this.fboA;
    let currentFboTexture = this.textureA;
    let altFbo = this.fboB;
    let altFboTexture = this.textureB;

    gl.bindVertexArray(this.vao);

    // Render through each shader pass sequentially
    for (let i = 0; i < enabledEffects.length; i++) {
      const effect = enabledEffects[i];
      const program = this.programCache.get(effect.type);

      if (!program) {
        console.warn(`Shader program not found for type: ${effect.type}`);
        continue;
      }

      // Bind draw FBO target
      gl.bindFramebuffer(gl.FRAMEBUFFER, currentFbo);
      gl.viewport(0, 0, this.width, this.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Use shader program
      gl.useProgram(program);

      // Bind the source texture from the previous pass
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentSourceTexture);
      this.setUniform(program, 'u_texture', 'float', 0);

      // Set standard pipeline uniforms
      this.setUniform(program, 'u_resolution', 'vec2', [this.width, this.height]);
      this.setUniform(program, 'u_time', 'float', time);

      // Set effect-specific custom uniforms
      const effectDef = AVAILABLE_EFFECTS[effect.type];
      if (effectDef && effectDef.uniforms) {
        for (const uni of effectDef.uniforms) {
          const val = effect.params[uni.name] !== undefined ? effect.params[uni.name] : uni.defaultValue;
          this.setUniform(program, uni.name, uni.type, val);
        }
      }

      // Draw full screen quad
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Ping-pong: current destination texture becomes next source
      currentSourceTexture = currentFboTexture;

      // Swap destination framebuffers and textures
      const tempFbo = currentFbo;
      const tempTex = currentFboTexture;
      currentFbo = altFbo;
      currentFboTexture = altFboTexture;
      altFbo = tempFbo;
      altFboTexture = tempTex;
    }

    // 3. Final Pass - render output of last pass onto screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    // Draw viewport on display canvas
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.passthroughProgram) {
      gl.useProgram(this.passthroughProgram);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentSourceTexture);
      this.setUniform(this.passthroughProgram, 'u_texture', 'float', 0);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  /**
   * Helper to set uniforms using location cache.
   */
  setUniform(program, name, type, value) {
    const gl = this.gl;
    const loc = this.getUniformLocation(program, name);
    if (!loc) return; // Uniform optimized out or invalid

    switch (type) {
      case 'float':
        gl.uniform1f(loc, Number(value));
        break;
      case 'boolean':
        gl.uniform1i(loc, value ? 1 : 0);
        break;
      case 'vec2': {
        const vector = Array.isArray(value) ? value : [0, 0];
        gl.uniform2f(loc, vector[0], vector[1]);
        break;
      }
      case 'vec3': {
        const vector = Array.isArray(value) ? value : [0, 0, 0];
        gl.uniform3f(loc, vector[0], vector[1], vector[2]);
        break;
      }
      case 'color': {
        const rgb = this.hexToRgb(String(value));
        gl.uniform3f(loc, rgb[0], rgb[1], rgb[2]);
        break;
      }
      default:
        console.warn(`Unsupported uniform type for setting: ${type}`);
    }
  }

  getUniformLocation(program, name) {
    let programCache = this.uniformLocationCache.get(program);
    if (!programCache) {
      programCache = new Map();
      this.uniformLocationCache.set(program, programCache);
    }

    if (!programCache.has(name)) {
      const loc = this.gl.getUniformLocation(program, name);
      programCache.set(name, loc);
    }

    return programCache.get(name) ?? null;
  }

  hexToRgb(hex) {
    let cleanHex = hex.replace('#', '');
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    const num = parseInt(cleanHex, 16);
    if (isNaN(num)) return [0, 0, 0];
    
    return [
      ((num >> 16) & 255) / 255,
      ((num >> 8) & 255) / 255,
      (num & 255) / 255
    ];
  }

  /**
   * Shader compilation and program linking code.
   */
  createProgram(vertexSrc, fragmentSrc) {
    const gl = this.gl;

    const compileShader = (type, src) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Could not create WebGL Shader object');
      gl.shaderSource(shader, src);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compile failure: ${info}\nSource:\n${src}`);
      }
      return shader;
    };

    const vs = compileShader(gl.VERTEX_SHADER, vertexSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fragmentSrc);

    const program = gl.createProgram();
    if (!program) throw new Error('Could not create WebGL Program object');

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    // Flag shaders for deletion once linked so they clean up automatically
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program link failure: ${info}`);
    }

    return program;
  }

  /**
   * Destroys WebGL resources to prevent GPU and CPU memory leaks.
   */
  destroy() {
    const gl = this.gl;

    // 1. Delete shader programs
    if (this.passthroughProgram) {
      gl.deleteProgram(this.passthroughProgram);
      this.passthroughProgram = null;
    }
    for (const program of this.programCache.values()) {
      gl.deleteProgram(program);
    }
    this.programCache.clear();
    this.uniformLocationCache.clear();

    // 2. Delete FBO resources
    this.cleanupFramebuffers();

    // 3. Delete textures
    if (this.videoTexture) {
      gl.deleteTexture(this.videoTexture);
      this.videoTexture = null;
    }

    // 4. Delete VAO
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    console.log('WebGLPipeline successfully destroyed. All WebGL resources released.');
  }
}
