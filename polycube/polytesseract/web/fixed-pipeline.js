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
  // Unrolled 4x4 matrix multiply (column-major)
  const a0=a[0],a1=a[1],a2=a[2],a3=a[3],a4=a[4],a5=a[5],a6=a[6],a7=a[7];
  const a8=a[8],a9=a[9],a10=a[10],a11=a[11],a12=a[12],a13=a[13],a14=a[14],a15=a[15];
  let b0=b[0],b1=b[1],b2=b[2],b3=b[3];
  out[0]=a0*b0+a4*b1+a8*b2+a12*b3;  out[1]=a1*b0+a5*b1+a9*b2+a13*b3;
  out[2]=a2*b0+a6*b1+a10*b2+a14*b3; out[3]=a3*b0+a7*b1+a11*b2+a15*b3;
  b0=b[4];b1=b[5];b2=b[6];b3=b[7];
  out[4]=a0*b0+a4*b1+a8*b2+a12*b3;  out[5]=a1*b0+a5*b1+a9*b2+a13*b3;
  out[6]=a2*b0+a6*b1+a10*b2+a14*b3; out[7]=a3*b0+a7*b1+a11*b2+a15*b3;
  b0=b[8];b1=b[9];b2=b[10];b3=b[11];
  out[8]=a0*b0+a4*b1+a8*b2+a12*b3;  out[9]=a1*b0+a5*b1+a9*b2+a13*b3;
  out[10]=a2*b0+a6*b1+a10*b2+a14*b3;out[11]=a3*b0+a7*b1+a11*b2+a15*b3;
  b0=b[12];b1=b[13];b2=b[14];b3=b[15];
  out[12]=a0*b0+a4*b1+a8*b2+a12*b3; out[13]=a1*b0+a5*b1+a9*b2+a13*b3;
  out[14]=a2*b0+a6*b1+a10*b2+a14*b3;out[15]=a3*b0+a7*b1+a11*b2+a15*b3;
  return out;
}

// Multiply into pre-allocated output buffer (no allocation)
function multiplyInto(out, a, b) {
  const a0=a[0],a1=a[1],a2=a[2],a3=a[3],a4=a[4],a5=a[5],a6=a[6],a7=a[7];
  const a8=a[8],a9=a[9],a10=a[10],a11=a[11],a12=a[12],a13=a[13],a14=a[14],a15=a[15];
  let b0=b[0],b1=b[1],b2=b[2],b3=b[3];
  out[0]=a0*b0+a4*b1+a8*b2+a12*b3;  out[1]=a1*b0+a5*b1+a9*b2+a13*b3;
  out[2]=a2*b0+a6*b1+a10*b2+a14*b3; out[3]=a3*b0+a7*b1+a11*b2+a15*b3;
  b0=b[4];b1=b[5];b2=b[6];b3=b[7];
  out[4]=a0*b0+a4*b1+a8*b2+a12*b3;  out[5]=a1*b0+a5*b1+a9*b2+a13*b3;
  out[6]=a2*b0+a6*b1+a10*b2+a14*b3; out[7]=a3*b0+a7*b1+a11*b2+a15*b3;
  b0=b[8];b1=b[9];b2=b[10];b3=b[11];
  out[8]=a0*b0+a4*b1+a8*b2+a12*b3;  out[9]=a1*b0+a5*b1+a9*b2+a13*b3;
  out[10]=a2*b0+a6*b1+a10*b2+a14*b3;out[11]=a3*b0+a7*b1+a11*b2+a15*b3;
  b0=b[12];b1=b[13];b2=b[14];b3=b[15];
  out[12]=a0*b0+a4*b1+a8*b2+a12*b3; out[13]=a1*b0+a5*b1+a9*b2+a13*b3;
  out[14]=a2*b0+a6*b1+a10*b2+a14*b3;out[15]=a3*b0+a7*b1+a11*b2+a15*b3;
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
    let gl = null;
    const _tried = [];
    for (const _ct of ["webgl", "experimental-webgl"]) {
      for (const _aa of [true, false]) {
        if (gl) break;
        try {
          gl = canvas.getContext(_ct, { antialias: _aa, alpha: false, depth: true, preserveDrawingBuffer: false });
          if (gl) _tried.push(_ct + (_aa ? '+aa' : '') + ':OK');
          else _tried.push(_ct + (_aa ? '+aa' : '') + ':null');
        } catch (e) { _tried.push(_ct + (_aa ? '+aa' : '') + ':' + e.message); }
      }
    }
    if (!gl) {
      throw new Error("WebGL unavailable (" + _tried.join(', ') + ") canvas:" + canvas.width + "x" + canvas.height);
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

    // Batched rendering: per-vertex color, all triangles in one draw call
    this.batchProgram = createProgram(
      gl,
      `
        attribute vec3 aPosition;
        attribute vec4 aColor;
        uniform mat4 uMvp;
        varying vec4 vColor;
        void main() {
          gl_Position = uMvp * vec4(aPosition, 1.0);
          vColor = aColor;
        }
      `,
      `
        precision mediump float;
        varying vec4 vColor;
        void main() {
          gl_FragColor = vColor;
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

    // Cache uniform/attribute locations (avoid per-draw-call lookups)
    this._solid_aPosition = gl.getAttribLocation(this.solidProgram, "aPosition");
    this._solid_uMvp = gl.getUniformLocation(this.solidProgram, "uMvp");
    this._solid_uColor = gl.getUniformLocation(this.solidProgram, "uColor");
    this._solid_uPointSize = gl.getUniformLocation(this.solidProgram, "uPointSize");
    this._tex_aPosition = gl.getAttribLocation(this.texturedProgram, "aPosition");
    this._tex_aTexcoord = gl.getAttribLocation(this.texturedProgram, "aTexcoord");
    this._tex_uMvp = gl.getUniformLocation(this.texturedProgram, "uMvp");
    this._tex_uColor = gl.getUniformLocation(this.texturedProgram, "uColor");
    this._batch_aPosition = gl.getAttribLocation(this.batchProgram, "aPosition");
    this._batch_aColor = gl.getAttribLocation(this.batchProgram, "aColor");
    this._batch_uMvp = gl.getUniformLocation(this.batchProgram, "uMvp");

    // Batch state: interleaved [x,y,z,r,g,b,a] per vertex, triangles
    this._batchData = new Float32Array(7 * 6 * 2048); // 2048 quads initial
    this._batchCount = 0; // number of floats written
    this._batchActive = false;
    this._batchBuffer = gl.createBuffer();
    this._batchColorBuffer = gl.createBuffer();

    // Pre-allocated vertex data buffer (grows as needed)
    this._vertBuf = new Float32Array(128);
    // Pre-allocated MVP buffer
    this._mvpBuf = new Float32Array(16);
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
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
    const m = this.currentMatrix;
    m[0]=1;m[1]=0;m[2]=0;m[3]=0;m[4]=0;m[5]=1;m[6]=0;m[7]=0;
    m[8]=0;m[9]=0;m[10]=1;m[11]=0;m[12]=0;m[13]=0;m[14]=0;m[15]=1;
  }

  orthof(left, right, bottom, top, near, far) {
    this.currentMatrix = ortho(left, right, bottom, top, near, far);
  }

  translatef(x, y, z) {
    // M = M * T is just: col3 += x*col0 + y*col1 + z*col2
    const m = this.currentMatrix;
    m[12] += x*m[0] + y*m[4] + z*m[8];
    m[13] += x*m[1] + y*m[5] + z*m[9];
    m[14] += x*m[2] + y*m[6] + z*m[10];
    m[15] += x*m[3] + y*m[7] + z*m[11];
  }

  scalef(x, y, z) {
    // M = M * S is just: col0 *= x, col1 *= y, col2 *= z
    const m = this.currentMatrix;
    m[0]*=x; m[1]*=x; m[2]*=x; m[3]*=x;
    m[4]*=y; m[5]*=y; m[6]*=y; m[7]*=y;
    m[8]*=z; m[9]*=z; m[10]*=z; m[11]*=z;
  }

  rotatef(angle, x, y, z) {
    if (angle === 0 || (x === 0 && y === 0 && z === 0)) {
      return;
    }
    this.currentMatrix = multiply(this.currentMatrix, rotation(angle, x, y, z));
  }

  multMatrixf(mat) {
    const m = this.currentMatrix;
    const a0=m[0],a1=m[1],a2=m[2],a3=m[3],a4=m[4],a5=m[5],a6=m[6],a7=m[7];
    const a8=m[8],a9=m[9],a10=m[10],a11=m[11],a12=m[12],a13=m[13],a14=m[14],a15=m[15];
    let b0=mat[0],b1=mat[1],b2=mat[2],b3=mat[3];
    m[0]=a0*b0+a4*b1+a8*b2+a12*b3;  m[1]=a1*b0+a5*b1+a9*b2+a13*b3;
    m[2]=a2*b0+a6*b1+a10*b2+a14*b3; m[3]=a3*b0+a7*b1+a11*b2+a15*b3;
    b0=mat[4];b1=mat[5];b2=mat[6];b3=mat[7];
    m[4]=a0*b0+a4*b1+a8*b2+a12*b3;  m[5]=a1*b0+a5*b1+a9*b2+a13*b3;
    m[6]=a2*b0+a6*b1+a10*b2+a14*b3; m[7]=a3*b0+a7*b1+a11*b2+a15*b3;
    b0=mat[8];b1=mat[9];b2=mat[10];b3=mat[11];
    m[8]=a0*b0+a4*b1+a8*b2+a12*b3;  m[9]=a1*b0+a5*b1+a9*b2+a13*b3;
    m[10]=a2*b0+a6*b1+a10*b2+a14*b3;m[11]=a3*b0+a7*b1+a11*b2+a15*b3;
    b0=mat[12];b1=mat[13];b2=mat[14];b3=mat[15];
    m[12]=a0*b0+a4*b1+a8*b2+a12*b3; m[13]=a1*b0+a5*b1+a9*b2+a13*b3;
    m[14]=a2*b0+a6*b1+a10*b2+a14*b3;m[15]=a3*b0+a7*b1+a11*b2+a15*b3;
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
    const vLen = this.vertices.length;
    if (!this.currentPrimitive || vLen === 0) {
      return;
    }
    const gl = this.gl;
    gl.useProgram(this.solidProgram);
    // Compute MVP into pre-allocated buffer
    multiplyInto(this._mvpBuf, this.projection, this.modelView);
    gl.uniformMatrix4fv(this._solid_uMvp, false, this._mvpBuf);
    gl.uniform4fv(this._solid_uColor, this.currentColor);
    gl.uniform1f(this._solid_uPointSize, 4);
    // Grow pre-allocated buffer if needed, then copy vertices
    if (this._vertBuf.length < vLen) {
      this._vertBuf = new Float32Array(vLen * 2);
    }
    const vb = this._vertBuf;
    const src = this.vertices;
    for (let i = 0; i < vLen; i++) vb[i] = src[i];
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vb.subarray(0, vLen), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this._solid_aPosition);
    gl.vertexAttribPointer(this._solid_aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(this.currentPrimitive, 0, vLen / 3);
    gl.disableVertexAttribArray(this._solid_aPosition);
  }

  // Batch rendering: collect quads as triangles with per-vertex color
  beginBatch() {
    this._batchCount = 0;
    this._batchActive = true;
  }

  // Add a quad (4 vertices as [x,y,z] arrays + color [r,g,b,a]) to the batch
  // Converts to 2 triangles (6 vertices)
  batchQuad(a, b, c, d, color) {
    const bd = this._batchData;
    let n = this._batchCount;
    // Grow buffer if needed (6 vertices × 7 floats = 42 per quad)
    if (n + 42 > bd.length) {
      const newBuf = new Float32Array(bd.length * 2);
      newBuf.set(bd);
      this._batchData = newBuf;
    }
    const r = color[0], g = color[1], bl = color[2], al = color[3];
    // Triangle 1: a, b, c
    bd[n]=a[0];bd[n+1]=a[1];bd[n+2]=a[2];bd[n+3]=r;bd[n+4]=g;bd[n+5]=bl;bd[n+6]=al; n+=7;
    bd[n]=b[0];bd[n+1]=b[1];bd[n+2]=b[2];bd[n+3]=r;bd[n+4]=g;bd[n+5]=bl;bd[n+6]=al; n+=7;
    bd[n]=c[0];bd[n+1]=c[1];bd[n+2]=c[2];bd[n+3]=r;bd[n+4]=g;bd[n+5]=bl;bd[n+6]=al; n+=7;
    // Triangle 2: a, c, d
    bd[n]=a[0];bd[n+1]=a[1];bd[n+2]=a[2];bd[n+3]=r;bd[n+4]=g;bd[n+5]=bl;bd[n+6]=al; n+=7;
    bd[n]=c[0];bd[n+1]=c[1];bd[n+2]=c[2];bd[n+3]=r;bd[n+4]=g;bd[n+5]=bl;bd[n+6]=al; n+=7;
    bd[n]=d[0];bd[n+1]=d[1];bd[n+2]=d[2];bd[n+3]=r;bd[n+4]=g;bd[n+5]=bl;bd[n+6]=al; n+=7;
    this._batchCount = n;
  }

  endBatch() {
    this._batchActive = false;
    const n = this._batchCount;
    if (n === 0) return;
    const gl = this.gl;
    gl.useProgram(this.batchProgram);
    multiplyInto(this._mvpBuf, this.projection, this.modelView);
    gl.uniformMatrix4fv(this._batch_uMvp, false, this._mvpBuf);
    // Upload interleaved data
    const data = this._batchData.subarray(0, n);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._batchBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    const stride = 7 * 4; // 7 floats × 4 bytes
    gl.enableVertexAttribArray(this._batch_aPosition);
    gl.vertexAttribPointer(this._batch_aPosition, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this._batch_aColor);
    gl.vertexAttribPointer(this._batch_aColor, 4, gl.FLOAT, false, stride, 3 * 4);
    gl.drawArrays(gl.TRIANGLES, 0, n / 7);
    gl.disableVertexAttribArray(this._batch_aPosition);
    gl.disableVertexAttribArray(this._batch_aColor);
  }

  createTextureFromImage(image) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    const pot = (image.width & (image.width - 1)) === 0 && (image.height & (image.height - 1)) === 0;
    if (pot) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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
    multiplyInto(this._mvpBuf, this.projection, this.modelView);
    gl.uniformMatrix4fv(this._tex_uMvp, false, this._mvpBuf);
    gl.uniform4fv(this._tex_uColor, color);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.boundTexture);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this._tex_aPosition);
    gl.vertexAttribPointer(this._tex_aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texcoords), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this._tex_aTexcoord);
    gl.vertexAttribPointer(this._tex_aTexcoord, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    gl.disableVertexAttribArray(this._tex_aPosition);
    gl.disableVertexAttribArray(this._tex_aTexcoord);
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
