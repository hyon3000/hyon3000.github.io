(() => {
const DEG2RAD = Math.PI / 180;

function identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function ortho(left, right, bottom, top, near, far) {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  return new Float32Array([
    -2 * lr, 0, 0, 0,
    0, -2 * bt, 0, 0,
    0, 0, 2 * nf, 0,
    (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1,
  ]);
}

function translation(x, y, z) {
  const out = identity();
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out;
}

function scaling(x, y, z) {
  const out = identity();
  out[0] = x;
  out[5] = y;
  out[10] = z;
  return out;
}

function rotation(angleDeg, x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  const nx = x / len;
  const ny = y / len;
  const nz = z / len;
  const s = Math.sin(angleDeg * DEG2RAD);
  const c = Math.cos(angleDeg * DEG2RAD);
  const t = 1 - c;

  return new Float32Array([
    nx * nx * t + c, ny * nx * t + nz * s, nz * nx * t - ny * s, 0,
    nx * ny * t - nz * s, ny * ny * t + c, nz * ny * t + nx * s, 0,
    nx * nz * t + ny * s, ny * nz * t - nx * s, nz * nz * t + c, 0,
    0, 0, 0, 1,
  ]);
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "Shader compile failed");
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
  }
  return program;
}

class FixedPipelineGLImpl {
  constructor(canvas) {
    const gl = canvas.getContext("webgl", {
      antialias: true,
      alpha: false,
      depth: true,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      throw new Error("WebGL is unavailable");
    }

    this.canvas = canvas;
    this.gl = gl;
    this.mode = "MODELVIEW";
    this.projection = identity();
    this.modelView = identity();
    this.projectionStack = [];
    this.modelViewStack = [];
    this.currentColor = [1, 1, 1, 1];
    this.currentPrimitive = null;
    this.vertices = [];
    this.boundTexture = null;

    this.vertexBuffer = gl.createBuffer();
    this.texcoordBuffer = gl.createBuffer();

    this.solidProgram = createProgram(
      gl,
      `
        attribute vec3 aPosition;
        uniform mat4 uMvp;
        uniform float uPointSize;
        void main() {
          gl_Position = uMvp * vec4(aPosition, 1.0);
          gl_PointSize = uPointSize;
        }
      `,
      `
        precision mediump float;
        uniform vec4 uColor;
        void main() {
          gl_FragColor = uColor;
        }
      `,
    );

    this.texturedProgram = createProgram(
      gl,
      `
        attribute vec3 aPosition;
        attribute vec2 aTexcoord;
        uniform mat4 uMvp;
        varying vec2 vTexcoord;
        void main() {
          gl_Position = uMvp * vec4(aPosition, 1.0);
          vTexcoord = aTexcoord;
        }
      `,
      `
        precision mediump float;
        uniform sampler2D uTexture;
        uniform vec4 uColor;
        varying vec2 vTexcoord;
        void main() {
          gl_FragColor = texture2D(uTexture, vTexcoord) * uColor;
        }
      `,
    );

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  }

  resize() {
    const renderScale = Math.max(1, Number(this.canvas.dataset.renderScale || "1"));
    const width = Math.max(1, Math.round(this.canvas.clientWidth * window.devicePixelRatio * renderScale));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * window.devicePixelRatio * renderScale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  matrixMode(mode) {
    this.mode = mode;
  }

  get currentMatrix() {
    return this.mode === "PROJECTION" ? this.projection : this.modelView;
  }

  set currentMatrix(value) {
    if (this.mode === "PROJECTION") {
      this.projection = value;
    } else {
      this.modelView = value;
    }
  }

  pushMatrix() {
    const source = new Float32Array(this.currentMatrix);
    if (this.mode === "PROJECTION") {
      this.projectionStack.push(source);
    } else {
      this.modelViewStack.push(source);
    }
  }

  popMatrix() {
    const stack = this.mode === "PROJECTION" ? this.projectionStack : this.modelViewStack;
    this.currentMatrix = stack.pop() || identity();
  }

  loadIdentity() {
    this.currentMatrix = identity();
  }

  orthof(left, right, bottom, top, near, far) {
    this.currentMatrix = ortho(left, right, bottom, top, near, far);
  }

  translatef(x, y, z) {
    this.currentMatrix = multiply(this.currentMatrix, translation(x, y, z));
  }

  scalef(x, y, z) {
    this.currentMatrix = multiply(this.currentMatrix, scaling(x, y, z));
  }

  rotatef(angle, x, y, z) {
    if (angle === 0 || (x === 0 && y === 0 && z === 0)) {
      return;
    }
    this.currentMatrix = multiply(this.currentMatrix, rotation(angle, x, y, z));
  }

  viewport(x, y, width, height) {
    this.gl.viewport(x, y, width, height);
  }

  clearColor(r, g, b, a) {
    this.gl.clearColor(r, g, b, a);
  }

  clear(mask) {
    this.gl.clear(mask);
  }

  color3f(r, g, b) {
    this.currentColor = [r, g, b, 1];
  }

  color4f(r, g, b, a) {
    this.currentColor = [r, g, b, a];
  }

  lineWidth(width) {
    this.gl.lineWidth(width);
  }

  begin(mode) {
    this.currentPrimitive = mode;
    this.vertices.length = 0;
  }

  vertex3f(x, y, z) {
    this.vertices.push(x, y, z);
  }

  end() {
    if (!this.currentPrimitive || this.vertices.length === 0) {
      return;
    }
    const gl = this.gl;
    gl.useProgram(this.solidProgram);
    const aPosition = gl.getAttribLocation(this.solidProgram, "aPosition");
    const uMvp = gl.getUniformLocation(this.solidProgram, "uMvp");
    const uColor = gl.getUniformLocation(this.solidProgram, "uColor");
    const uPointSize = gl.getUniformLocation(this.solidProgram, "uPointSize");
    gl.uniformMatrix4fv(uMvp, false, multiply(this.projection, this.modelView));
    gl.uniform4fv(uColor, this.currentColor);
    gl.uniform1f(uPointSize, 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(this.currentPrimitive, 0, this.vertices.length / 3);
    gl.disableVertexAttribArray(aPosition);
  }

  createTextureFromImage(image) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return texture;
  }

  bindTexture(texture) {
    this.boundTexture = texture;
  }

  drawTexturedQuad(vertices, texcoords, color = this.currentColor) {
    if (!this.boundTexture) {
      return;
    }
    const gl = this.gl;
    gl.useProgram(this.texturedProgram);
    const aPosition = gl.getAttribLocation(this.texturedProgram, "aPosition");
    const aTexcoord = gl.getAttribLocation(this.texturedProgram, "aTexcoord");
    const uMvp = gl.getUniformLocation(this.texturedProgram, "uMvp");
    const uColor = gl.getUniformLocation(this.texturedProgram, "uColor");
    gl.uniformMatrix4fv(uMvp, false, multiply(this.projection, this.modelView));
    gl.uniform4fv(uColor, color);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.boundTexture);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texcoords), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(aTexcoord);
    gl.vertexAttribPointer(aTexcoord, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    gl.disableVertexAttribArray(aPosition);
    gl.disableVertexAttribArray(aTexcoord);
  }
}

const GL = {
  COLOR_BUFFER_BIT: 0x4000,
  DEPTH_BUFFER_BIT: 0x0100,
  LINE_STRIP: 0x0003,
  LINES: 0x0001,
  POINTS: 0x0000,
  TRIANGLE_FAN: 0x0006,
};

window.FixedPipelineGL = FixedPipelineGLImpl;
window.GL = GL;
})();
