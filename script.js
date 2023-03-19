"use strict";
// ************************************************************
function HSLtoRGB(h, s, l) {
	let r, g, b;

	const rd = a => {
		return Math.floor(Math.max(Math.min(a * 256, 255), 0));
	};

	const hueToRGB = (m, n, o) => {
		if (o < 0) o += 1;
		if (o > 1) o -= 1;
		if (o < 1 / 6) return m + (n - m) * 6 * o;
		if (o < 1 / 2) return n;
		if (o < 2 / 3) return m + (n - m) * (2 / 3 - o) * 6;
		return m;
	};

	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;

	r = hueToRGB(p, q, h + 1 / 3);
	g = hueToRGB(p, q, h);
	b = hueToRGB(p, q, h - 1 / 3);

	return [rd(r), rd(g), rd(b)];
}
function RGBtoHex(r, g, b) {
	return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}

function hexToRgb(hex) {
	var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result ? {
		r: parseInt(result[1], 16),
		g: parseInt(result[2], 16),
		b: parseInt(result[3], 16)
	} : null;
}

const randomColor = () => {
	const hBase = Math.random();
	const newH = Math.floor(hBase * 360);
	const newL = Math.floor(Math.random() * 16) + 75;
	const rgb = HSLtoRGB(hBase, 1, newL * 0.01);
	return RGBtoHex(rgb[0], rgb[1], rgb[2]);
};

function getRelativeMousePosition(event, target) {
	target = target || event.target;
	var rect = target.getBoundingClientRect();

	return {
		x: event.clientX - rect.left,
		y: event.clientY - rect.top
	};
}

// assumes target or event.target is canvas
function getNoPaddingNoBorderCanvasRelativeMousePosition(event, target) {
	target = target || event.target;
	var pos = getRelativeMousePosition(event, target);

	pos.x = (pos.x * target.width) / target.clientWidth;
	pos.y = (pos.y * target.height) / target.clientHeight;

	return pos;
}

let MAX_POINTS = 10;
let image;
let warps;
let src_c, dst_c;

let colors = {
	tl: randomColor(),
	tr: randomColor(),
	bl: randomColor(),
	br: randomColor()
};

// ************************************************************

function load_resource(url) {
	let req = new XMLHttpRequest();
	req.open("GET", url, false);
	req.overrideMimeType("text/plain; charset=x-user-defined");
	req.send(null);
	if (req.status != 200 && req.status != 0) return null;
	return req.responseText;
}

function load_source(element_id) {
	let element = document.getElementById(element_id);
	if (!element) throw Error("element '" + element_id + "' not found");

	if (element.hasAttribute("src")) return load_resource(element.src);
	else return element.text;
}

// ************************************************************

function Warp(parent, which, src, dst) {
	this.parent = parent;
	this.which = which;
	this.src = src;
	this.dst = dst;
	this.s2 = [];
	this.w = [];
	for (let i = 0; i < MAX_POINTS; i++) {
		this.s2.push(0);
		this.w.push([0, 0]);
	}
}

Warp.prototype = new Object();

Warp.prototype.npoints = function () {
	return this.parent.npoints;
};

Warp.prototype.get_src = function () {
	let src = this.src.slice(0, this.npoints());
	for (let i = 0; i < src.length; i++) src[i] = src[i].slice();
	return src;
};

Warp.prototype.get_dst = function () {
	let dst = this.dst.slice(0, this.npoints());
	for (let i = 0; i < dst.length; i++) dst[i] = dst[i].slice();
	return dst;
};

Warp.prototype.distance_squared = function (x, y, y_is_x) {
	if (y_is_x) {
		let gram = [];
		for (let r = 0; r < x.length; r++) {
			let row = [];
			for (let c = 0; c < x.length; c++)
				row.push(x[r][0] * x[c][0] + x[r][1] * x[c][1]);
			gram.push(row);
		}

		let result = [];
		for (let r = 0; r < x.length; r++) {
			let row = [];
			for (let c = 0; c < x.length; c++)
				row.push(gram[r][r] + gram[c][c] - 2 * gram[r][c]);
			result.push(row);
		}
		return result;
	} else {
		let gram = [];
		for (let r = 0; r < x.length; r++) {
			let row = [];
			for (let c = 0; c < y.length; c++)
				row.push(x[r][0] * y[c][0] + x[r][1] * y[c][1]);
			gram.push(row);
		}

		let diagx = [];
		for (let i = 0; i < x.length; i++)
			diagx.push(x[i][0] * x[i][0] + x[i][1] * x[i][1]);

		let diagy = [];
		for (let i = 0; i < y.length; i++)
			diagy.push(y[i][0] * y[i][0] + y[i][1] * y[i][1]);

		let result = [];
		for (let r = 0; r < x.length; r++) {
			let row = [];
			for (let c = 0; c < y.length; c++)
				row.push(diagx[r] + diagy[c] - 2 * gram[r][c]);
			result.push(row);
		}
		return result;
	}
};

Warp.prototype.rbf = function (x, y, y_is_x) {
	let dists2 = this.distance_squared(x, y, y_is_x);

	if (y_is_x) {
		let d2max = dists2[0][0];
		for (let r = 0; r < dists2.length; r++)
			for (let c = 0; c < dists2[r].length; c++)
				if (d2max < dists2[r][c]) d2max = dists2[r][c];

		let dtmp = [];
		for (let r = 0; r < dists2.length; r++) {
			let row = [];
			for (let c = 0; c < dists2[r].length; c++)
				row.push(r == c ? d2max : dists2[r][c]);
			dtmp.push(row);
		}

		for (let c = 0; c < dtmp[0].length; c++) {
			let min = dtmp[0][c];
			for (let r = 1; r < dtmp.length; r++)
				if (min > dtmp[r][c]) min = dtmp[r][c];
			this.s2[c] = min;
		}
	}

	let result = [];
	for (let r = 0; r < dists2.length; r++) {
		let row = [];
		for (let c = 0; c < dists2[r].length; c++)
			row.push(Math.sqrt(dists2[r][c] + this.s2[c]));
		result.push(row);
	}

	return result;
};

// solve A.x = b
function linsolve(A, b) {
	let rows = A.length;
	let cols = A[0].length;
	let bcols = b[0].length;

	for (let c = 0; c < cols - 1; c++) {
		// make column c of all rows > c equal to zero
		//  by subtracting the appropriate multiple of row c
		let r0 = c;
		let r1 = r0 + 1;

		// find row with largest value in column c (pivot row)
		let max = Math.abs(A[r0][c]);
		let max_r = r0;
		for (let r = r0 + 1; r < rows; r++) {
			let x = Math.abs(A[r][c]);
			if (max < x) {
				max = x;
				max_r = r;
			}
		}

		// move pivot row to top
		if (max_r != r0) {
			let tA = A[r0];
			A[r0] = A[max_r];
			A[max_r] = tA;
			let tb = b[r0];
			b[r0] = b[max_r];
			b[max_r] = tb;
		}

		for (let r = r1; r < rows; r++) {
			let k0 = A[r0][c];
			let k1 = A[r][c];
			for (let i = c; i < cols; i++) A[r][i] = k0 * A[r][i] - k1 * A[r0][i];
			for (let i = 0; i < bcols; i++) b[r][i] = k0 * b[r][i] - k1 * b[r0][i];
		}
	}

	for (let r = rows - 1; r >= 0; r--) {
		for (let c = rows - 1; c > r; c--) {
			let k = A[r][c];
			A[r][c] = 0;
			for (let i = 0; i < bcols; i++) b[r][i] -= k * b[c][i];
		}
		for (let i = 0; i < bcols; i++) b[r][i] /= A[r][r];
		A[r][r] = 1;
	}

	return b;
}

Warp.prototype.update = function () {
	if (this.npoints() < 4) return;

	let x = this.get_src();
	let y = this.get_dst();
	let H = this.rbf(x, x, true);
	let w = linsolve(H, y);
	for (let i = 0; i < w.length; i++) this.w[i] = w[i];
};

Warp.prototype.warp = function (verts) {
	if (this.npoints() < 4) return verts.slice();

	let H = this.rbf(verts, this.get_src());
	let result = [];
	for (let r = 0; r < H.length; r++) {
		let row = [];
		for (let c = 0; c < 2; c++) {
			let x = 0;
			for (let i = 0; i < H[r].length; i++) x += H[r][i] * this.w[i][c];
			row.push(x);
		}
		result.push(row);
	}

	return result;
};

// ************************************************************

function Warps(src = [], dst = [], npoints = 0) {
	this.npoints = npoints;
	this.src = src;
	this.dst = dst;
	for (let i = npoints; i < MAX_POINTS; i++) {
		this.src.push([0, 0]);
		this.dst.push([0, 0]);
	}

	this.src.map(item => {
		if (typeof item[0] !== "number" || typeof item[1] !== "number") {
			return [0, 0];
		}
		return item;
	});

	this.dst.map(item => {
		if (typeof item[0] !== "number" || typeof item[1] !== "number") {
			return [0, 0];
		}
		return item;
	});

	this.warps = [
		new Warp(this, 0, this.src, this.dst),
		new Warp(this, 1, this.dst, this.src)
	];
}

Warps.prototype = new Object();

Warps.prototype.update = function () {
	for (let i = 0; i < this.warps.length; i++) this.warps[i].update();
};

Warps.prototype.add = function (sx, sy, dx, dy, flip) {
	if (flip) {
		let tx = sx;
		sx = dx;
		dx = tx;
		let ty = sy;
		sy = dy;
		dy = ty;
	}

	this.src[this.npoints] = [sx, sy];
	this.dst[this.npoints] = [dx, dy];
	this.npoints++;
	this.update();
};

Warps.prototype.add_pair = function (which, x, y) {
	let idx = which ? 1 : 0;
	let p = this.warps[idx].warp([[x, y]])[0];
	let dx = p[0];
	let dy = p[1];
	this.add(x, y, dx, dy, which);
};

Warps.prototype.delete = function (idx) {
	for (let i = idx; i < this.npoints - 1; i++) {
		this.src[i] = this.src[i + 1].slice();
		this.dst[i] = this.dst[i + 1].slice();
	}
	this.npoints--;
	this.update();
};

Warps.prototype.removeAll = function () {
	for (let i = 0; i < this.npoints - 1; i++) {
		this.src[i] = [0, 0];
		this.dst[i] = [0, 0];
	}
	this.npoints = 0;
	this.update();
};

Warps.prototype.setData = function (src, dst, n) {
	for (let i = 0; i < MAX_POINTS; i++) {
		if (i < n) {
			this.src[i] = src[i];
			this.dst[i] = dst[i];
		} else {
			this.src[i] = [0, 0];
			this.dst[i] = [0, 0];
		}
	}
	this.npoints = n;
	this.update();
};

// ************************************************************

function Canvas(warp, canvas, id, isClone) {
	this.warp = warp;
	this.id = id;

	this.canvas = canvas;
	canvas.setAttribute("tabIndex", warp.which + 1);
	this.ctx = canvas.getContext("webgl", { preserveDrawingBuffer: true });
	this.isClone = isClone;
	this.errors = null;
	this.texture = null;
	this.position_buffer = null;
	this.texcoord_buffer = null;
	this.index_buffer = null;
	this.num_indices = null;
	this.warp_program = null;
	this.drag = null;
	this.radius = 10;

	this.setup();
}

Canvas.prototype.check_error = function () {
	let gl = this.ctx;

	if (this.errors == null) {
		this.errors = {};
		this.errors[gl.INVALID_ENUM] = "invalid enum";
		this.errors[gl.INVALID_VALUE] = "invalid value";
		this.errors[gl.INVALID_OPERATION] = "invalid operation";
		this.errors[gl.OUT_OF_MEMORY] = "out of memory";
	}
	for (let i = 0; i < 10; i++) {
		let code = gl.getError();
		if (code == 0) return;
		throw Error(this.errors[code]);
	}
};

Canvas.prototype.shader = function (name, type, src) {
	let gl = this.ctx;
	let shader = gl.createShader(type);
	gl.shaderSource(shader, src);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
		throw Error(name + ": " + gl.getShaderInfoLog(shader));

	return shader;
};

Canvas.prototype.program = function (name, vertex, fragment) {
	let gl = this.ctx;

	let vertex_src = load_source(vertex);
	let fragment_src = load_source(fragment);

	let vertex_shader = this.shader(
		name + ".vertex",
		gl.VERTEX_SHADER,
		vertex_src
	);
	let fragment_shader = this.shader(
		name + ".fragment",
		gl.FRAGMENT_SHADER,
		fragment_src
	);

	let program = gl.createProgram();
	gl.attachShader(program, vertex_shader);
	gl.attachShader(program, fragment_shader);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS))
		throw new Error(gl.getProgramInfoLog(program));

	this.check_error();

	return program;
};

Canvas.prototype.setup_programs = function () {
	this.warp_program = this.program("warp", "warp_vertex", "warp_fragment");
	this.point_program = this.program("points", "point_vertex", "point_fragment");
};
let texture;

Canvas.prototype.make_texture = function (image) {
	let gl = this.ctx;

	texture = gl.createTexture();

	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	// gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
	gl.generateMipmap(gl.TEXTURE_2D);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(
		gl.TEXTURE_2D,
		gl.TEXTURE_MIN_FILTER,
		gl.LINEAR_MIPMAP_LINEAR
	);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	this.check_error();

	return texture;
};

Canvas.prototype.destory = function () {
	this.ctx.deleteTexture(texture);
	this.ctx.deleteBuffer(this.position_buffer);
	this.ctx.deleteBuffer(this.texcoord_buffer);
	this.ctx.deleteBuffer(this.points_buffer);
	this.ctx.deleteBuffer(this.index_buffer);
};

Canvas.prototype.setup_buffers = function () {
	let gl = this.ctx;

	let position = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
	this.position_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, this.position_buffer);
	gl.bufferData(gl.ARRAY_BUFFER, position, gl.STATIC_DRAW);

	let texcoord = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
	this.texcoord_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoord_buffer);
	gl.bufferData(gl.ARRAY_BUFFER, texcoord, gl.STATIC_DRAW);

	this.points_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, this.points_buffer);
	gl.bufferData(gl.ARRAY_BUFFER, MAX_POINTS * 2 * 4, gl.STATIC_DRAW);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);

	this.indices = new Uint16Array([0, 1, 2, 2, 3, 0]);
	this.num_indices = this.indices.length;
	this.index_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index_buffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);

	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

	this.check_error();
};

Canvas.prototype.set_uniform = function (program, letiable, func, type, value) {
	let gl = this.ctx;

	let loc = gl.getUniformLocation(program, letiable);

	if (type == 0) func.call(gl, loc, value);
	else if (type == 1) func.call(gl, loc, new Float32Array(value));
	else throw new Error("invalid type");
};

function flatten(a, levels) {
	if (!levels) return a;
	let result = [];
	for (let i = 0; i < a.length; i++) {
		let x = a[i];
		if (levels > 1) x = flatten(x, levels - 1);
		for (let j = 0; j < x.length; j++) result.push(x[j]);
	}
	return result;
}

function refresh() {
	colors.tl = randomColor();
	colors.tr = randomColor();
	colors.bl = randomColor();
	colors.br = randomColor();
	updateColors();
	updateUrl();
	redraw();
}
Canvas.prototype.draw = function () {
	let gl = this.ctx;

	gl.clearColor(0.5, 0.5, 1.0, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT);

	if (this.warp.npoints() >= 4) {
		gl.useProgram(this.warp_program);
		this.set_uniform(
			this.warp_program,
			"u_color3",
			gl.uniform1i,
			0,
			colors.tl.replace("#", "0x")
		);
		this.set_uniform(
			this.warp_program,
			"u_color4",
			gl.uniform1i,
			0,
			colors.tr.replace("#", "0x")
		);
		this.set_uniform(
			this.warp_program,
			"u_color2",
			gl.uniform1i,
			0,
			colors.br.replace("#", "0x")
		);
		this.set_uniform(
			this.warp_program,
			"u_color1",
			gl.uniform1i,
			0,
			colors.bl.replace("#", "0x")
		);

		this.set_uniform(this.warp_program, "tex", gl.uniform1i, 0, 0);
		this.set_uniform(
			this.warp_program,
			"warp",
			gl.uniform1i,
			0,
			this.warp.which
		);
		this.set_uniform(
			this.warp_program,
			"npoints",
			gl.uniform1i,
			0,
			this.warp.npoints()
		);
		this.set_uniform(
			this.warp_program,
			"points",
			gl.uniform2fv,
			1,
			flatten(this.warp.src, 1)
		);
		this.set_uniform(this.warp_program, "s2", gl.uniform1fv, 1, this.warp.s2);
		this.set_uniform(
			this.warp_program,
			"w",
			gl.uniform2fv,
			1,
			flatten(this.warp.w, 1)
		);

		gl.activeTexture(gl.TEXTURE0);
		// gl.bindTexture(gl.TEXTURE_2D, this.texture);

		let position_attrib = gl.getAttribLocation(this.warp_program, "a_Position");
		let texcoord_attrib = gl.getAttribLocation(this.warp_program, "a_TexCoord");
		gl.enableVertexAttribArray(position_attrib);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.position_buffer);
		gl.vertexAttribPointer(position_attrib, 2, gl.FLOAT, false, 0, 0);

		gl.enableVertexAttribArray(texcoord_attrib);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoord_buffer);
		gl.vertexAttribPointer(texcoord_attrib, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, null);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index_buffer);

		gl.drawElements(gl.TRIANGLES, this.num_indices, gl.UNSIGNED_SHORT, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
		gl.disableVertexAttribArray(position_attrib);
		gl.disableVertexAttribArray(texcoord_attrib);

		gl.useProgram(null);
	} else {
		console.log('not enough points')
	}

	if (this.warp.npoints() > 0 && !this.isClone) {
		gl.useProgram(this.point_program);

		this.set_uniform(
			this.point_program,
			"radius",
			gl.uniform1f,
			0,
			this.radius
		);

		this.set_uniform(this.point_program, "color", gl.uniform3fv, 0, [255, 255, 255]);
		let position_attrib = gl.getAttribLocation(
			this.point_program,
			"a_Position"
		);

		let coords = this.warp.get_src();

		gl.enableVertexAttribArray(position_attrib);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.points_buffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(flatten(coords, 1)));
		gl.vertexAttribPointer(position_attrib, 2, gl.FLOAT, false, 0, 0);

		gl.drawArrays(gl.POINTS, 0, coords.length);

		gl.bindBuffer(gl.ARRAY_BUFFER, null);

		gl.disableVertexAttribArray(position_attrib);

		gl.useProgram(null);
	}

	gl.flush();

	this.check_error();
};

Canvas.prototype.find_point = function (x, y, sx, sy) {
	let coords = this.warp.get_src();

	let radius2 = this.radius * this.radius;

	for (let i = 0; i < coords.length; i++) {
		let px = coords[i][0];
		let py = coords[i][1];
		let dx = (px - x) / sx;
		let dy = (py - y) / sy;
		let d2 = dx * dx + dy * dy;
		if (d2 <= radius2) return i;
	}

	return null;
};

Canvas.prototype.mouse_down = function (event) {
	if (event.button != 0) return;
	let rect = this.canvas.getBoundingClientRect();

	const obj = {
		s: warps.src.map(item => [parseFloat(item[0]), parseFloat(item[1])]),
		d: warps.dst.map(item => [parseFloat(item[0]), parseFloat(item[1])]),
		p: warps.npoints
	};
	previousData.unshift(obj);
	if (previousData.length > maxUndo) {
		previousData.pop();
	}

	let w = rect.right - rect.left;
	let h = rect.bottom - rect.top;
	let sx = 2 / w;
	let sy = 2 / h;
	let x = (event.clientX - rect.left) * sx - 1;
	let y = (rect.bottom - event.clientY) * sy - 1;
	let i = this.find_point(x, y, sx, sy);
	if (i == null) {
		if (warps.npoints === 10) {
			alert(
				"You can not have more than 11 points. Please hold shift + left click to remove a point."
			);
		} else {
			warps.add_pair(this.warp.which, x, y);
		}
	} else if (event.shiftKey) {
		if (warps.npoints === 4) {
			alert("You can not have less than 4 points.");
		} else {
			warps.delete(i);
		}
	} else {
		let p = this.warp.src[i];
		this.drag = [i, x, y, p[0], p[1]];
	}
	redraw();
};

Canvas.prototype.mouse_up = function (event) {
	updateUrl();
	if (event.button != 0) return;

	if (this.drag == null) return;

	this.drag = null;
	warps.update();

	redraw();
};
function clearUrl() {
	window.history.replaceState(
		{},
		"/",
		location.hostname === "localhost" ? "/" : "/"
	);
	init();
}

let previousData = [];
const maxUndo = 20;
let redoData = [];
const acc = 3;
function updateUrl(d) {
	return;
	const obj = d || {
		s: warps.src
			.filter(item => item[0] !== 0 || item[1] !== 0)
			.map(item => [
				parseFloat(item[0].toFixed(acc)),
				parseFloat(item[1].toFixed(acc))
			]),
		d: warps.dst
			.filter(item => item[0] !== 0 || item[1] !== 0)
			.map(item => [
				parseFloat(item[0].toFixed(acc)),
				parseFloat(item[1].toFixed(acc))
			]),
		p: warps.npoints
	};
	const hash = btoa(JSON.stringify(obj));
	const urlParams = new URLSearchParams(window.location.search);
	urlParams.set("w", hash);
	const h = btoa(JSON.stringify(colors));
	urlParams.set("c", h);
	window.history.replaceState(
		{},
		location.hostname === "localhost" ? "/" : "/",
		"?" + urlParams.toString()
	);
}
function keypressFunction(e) {
	var evtobj = window.event ? event : e;
	console.log(evtobj.keyCode);
	if (evtobj.keyCode == 219) {
		if (redoData.length > 0) {
			const undo = {
				s: warps.src.map(item => [
					parseFloat(item[0].toFixed(acc)),
					parseFloat(item[1].toFixed(acc))
				]),
				d: warps.dst.map(item => [
					parseFloat(item[0].toFixed(acc)),
					parseFloat(item[1].toFixed(acc))
				]),
				p: warps.npoints
			};

			console.log(undo)
			const data = redoData.shift();

			previousData.unshift(undo);
			warps.removeAll();
			warps.setData(data.s, data.d, data.p);
			updateUrl(data);
			redraw();
		}
	} else if (evtobj.keyCode == 221) {
		if (previousData.length > 0) {
			const data = previousData.shift();
			const redo = {
				s: warps.src.map(item => [
					parseFloat(item[0].toFixed(acc)),
					parseFloat(item[1].toFixed(acc))
				]),
				d: warps.dst.map(item => [
					parseFloat(item[0].toFixed(acc)),
					parseFloat(item[1].toFixed(acc))
				]),
				p: warps.npoints
			};

			redoData.unshift(redo);
			warps.removeAll();
			warps.setData(data.s, data.d, data.p);
			updateUrl(data);
			redraw();
		}
	}
}

document.addEventListener("keydown", keypressFunction);

Canvas.prototype.mouse_move = function (event) {
	if (event.button != 0) return;
	if (this.drag == null) return;

	let rect = this.canvas.getBoundingClientRect();
	let w = rect.right - rect.left;
	let h = rect.bottom - rect.top;
	let x = ((event.clientX - rect.left) / w) * 2 - 1;
	let y = ((rect.bottom - event.clientY) / h) * 2 - 1;

	let i = this.drag[0];
	let x0 = this.drag[1];
	let y0 = this.drag[2];
	let px = this.drag[3];
	let py = this.drag[4];
	let qx = px + x - x0;
	let qy = py + y - y0;

	console.log(qx, qy);

	this.warp.src[i] = [qx, qy];
	meshGradient.hasUnsavedChanges = true;
	warps.update();
	redraw();
};

Canvas.prototype.setup = function () {
	this.setup_programs();
	this.setup_buffers();
	this.canvas.onmousedown = this.mouse_down.bind(this);
	this.canvas.onmouseup = this.mouse_up.bind(this);
	this.canvas.onmousemove = this.mouse_move.bind(this);
};

// ************************************************************

let needsDraw = false;
function redraw() {
	needsDraw = true;
}

function loop(time) {
	if (needsDraw) {
		src_c.draw();
		dst_c.draw();
		clone.draw();
		needsDraw = false;
	}
	requestAnimationFrame(loop);
}

function adjust() {
	const b = document.querySelector(".body");
	const c = document.getElementById("canvas1");
	const c2 = document.getElementById("canvas2");
	const r = c.getBoundingClientRect();
	const r2 = c2.getBoundingClientRect();
	const bo = b.getBoundingClientRect();

}

let tut = 0;
function nextTut() {
	if (tut === 0) {
		document.querySelector(".t1").style.opacity = 0;
		document.querySelector(".t2").style.opacity = 1;
		document.querySelector("#tut2").style = "z-index: 10";
		document.querySelector("#tut1").style = "z-index: 0";
	} else if (tut === 1) {
		document.querySelector(".tutorial").classList.remove("visible");
		localStorage.setItem("user", true);
	}
	tut += 1;
}
const user = localStorage.getItem("user");

window.addEventListener("resize", adjust);
let clone;

const isSafari =
	navigator.userAgent.search("Safari") >= 0 &&
	navigator.userAgent.search("Chrome") < 0;
function startTut() {
	document.querySelector("#welcome").classList.remove("visible");
	const tutorial = document.querySelector(".tutorial");
	const t1 = document.querySelector("#tut1");
	const t2 = document.querySelector("#tut2");
	tutorial.classList.add("visible");
	t1.style = "z-index: 1;";
}

function init() {
	const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

	const exportbtn = document.querySelector(".export-btn");

	exportbtn.addEventListener("click", () => {
		exportbtn.href = document.getElementById("canvas3").toDataURL();
		exportbtn.download = "mesh-gradient.png";
	});

	adjust();

	if (!user) {
	}

	const urlParams = new URLSearchParams(window.location.search);
	const o = urlParams.get("w")
		? JSON.parse(window.atob(urlParams.get("w")))
		: {};
	if (urlParams.get("c")) {
		try {
			const l = JSON.parse(window.atob(urlParams.get("c")));
			colors = l;
		} catch (e) {
			console.log("err", e);
		}
	}
	updateColors();
	warps = new Warps(
		o.s ? o.s.slice(0, o.p) : [],
		o.d ? o.d.slice(0, o.p) : [],
		o.p
	);
	src_c = new Canvas(
		warps.warps[0],
		document.getElementById("canvas1"),
		"canvas1"
	);
	dst_c = new Canvas(
		warps.warps[1],
		document.getElementById("canvas2"),
		"canvas2"
	);
	clone = new Canvas(
		warps.warps[1],
		document.getElementById("canvas3"),
		"canvas3",
		true
	);

	const addDefault = () => {
		let pairs = [
			[-0.9, 0.9],
			[0.9, 0.9],
			[-0.9, -0.9],
			[0.9, -0.9]
		];
		for (let i = 0; i < pairs.length; i++) {
			let x = pairs[i][0];
			let y = pairs[i][1];
			warps.add_pair(0, x, y);
		}
	};

	if (!urlParams.get("w")) {
		addDefault();
	}

	warps.update();
	redraw();
	loop();
	initMeshGradientJS();
}

function changeColor(e) {
	colors[e.target.getAttribute("data-gradient")] = e.target.value;
	updateUrl();
	redraw();
}

function updateColors() {
	const b = document.querySelector(".btn-group");
	b.innerHTML = "";
	Object.keys(colors).forEach(side => {
		const color = colors[side];
		const i = document.createElement("INPUT");
		const d = document.createElement("div");
		i.value = color;
		i.type = "color";
		i.addEventListener("change", changeColor);
		i.setAttribute("data-gradient", side);
		d.setAttribute("aria-label", color.toUpperCase());
		d.setAttribute("data-balloon-pos", "up");
		d.appendChild(i);
		b.appendChild(d);
	});
}

let infoToggled = false;

function cl(event) {
	const dialog = document.getElementById("info-dialog");

	var rect = dialog.getBoundingClientRect();
	var isInDialog =
		rect.top <= event.clientY &&
		event.clientY <= rect.top + rect.height &&
		rect.left <= event.clientX &&
		event.clientX <= rect.left + rect.width;
	if (!isInDialog) {
		dialog.close();
	}
}

function debounce(func, wait = 100) {
	let timeout;
	return function (...args) {
		clearTimeout(timeout);
		timeout = setTimeout(() => {
			func.apply(this, args);
		}, wait);
	};
}

// window.addEventListener(
// 	"resize",
// 	debounce(() => init(), 300)
// );

function togglePreview() {
	document.getElementById("canvas1").classList.add("hidden");
	document.getElementById("draggable").classList.add("hidden");
}

function toggleEdit() {
	document.getElementById("canvas1").classList.remove("hidden");
	document.getElementById("draggable").classList.remove("hidden");
}

let gallery = true;

function easeInOutQuad(elapsed, initialValue, amountOfChange, duration) {
	if ((elapsed /= duration / 2) < 1) {
		return amountOfChange / 2 * elapsed * elapsed + initialValue;
	}
	return -amountOfChange / 2 * (--elapsed * (elapsed - 2) - 1) + initialValue;
}

/**
 * Init mesh gradient instance
 */

class MeshGradientTimeline {
	hasUnsavedChanges = false;

	currentFrame = false;
	frames = [];
	transitionDuration = 2000;

	// Animation variables
	_transitionStartTime;
	_transitionElapsedTime;
	_transitionFromState;
	_transitionToState;


	constructor() {
		this.init();
	}

	init() {
		// if ?s is set, load url state
		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get("s")) {
			this.loadURLState();
		}
	}

	/**
	 * Captures the current state the editor and stores it in the timeline
	 */
	addFrame() {
		const frame = new MeshGradientFrame();
		// Clone and store colors from hex to RGB.
		frame.setColors(JSON.parse(JSON.stringify(colors)));

		// Clone and store the number of points.
		frame.setPointCount(JSON.parse(JSON.stringify(warps.npoints)));

		// Clone and store color picker point values.
		frame.setColorPoints(JSON.parse(JSON.stringify(src_c.warp.src)));

		// Clone and store distortion picker point values.
		frame.setDistortionPoints(JSON.parse(JSON.stringify(dst_c.warp.src)));

		this.frames.push(frame);
		console.log(warps.src);

		this.currentFrame = this.frames.length - 1;

		this.hasUnsavedChanges = false;
	}

	loadFrame(frameIndex) {
		if (this.frames[frameIndex] === undefined) {
			console.log("Frame not found");
			return;
		}

		this.currentFrame = frameIndex;
		const frame = this.frames[frameIndex];

		// Restore colors from frame
		colors = JSON.parse(JSON.stringify(frame.getColors()));

		// Restore color picker point values from frame
		const src = JSON.parse(JSON.stringify(frame.getColorPoints()));
		const dst = JSON.parse(JSON.stringify(frame.getDistortionPoints()));
		const points = JSON.parse(JSON.stringify(frame.getPointCount()));

		warps.removeAll();
		warps.setData(src, dst, points);

		this.hasUnsavedChanges = false;

		updateColors();
		warps.update();
		redraw();
	}

	saveFrame() {
		const frame = this.frames[this.currentFrame];

		// Clone and store colors from hex to RGB.
		frame.setColors(JSON.parse(JSON.stringify(colors)));

		// Clone and store color picker point values.
		frame.setColorPoints(JSON.parse(JSON.stringify(src_c.warp.src)));

		// Clone and store distortion picker point values.
		frame.setDistortionPoints(JSON.parse(JSON.stringify(warps.dst)));

		this.hasUnsavedChanges = false;
	}

	updateURL() {
		let stateData = {
			colors: colors,
			srcPoints: src_c.warp.src,
			dstPoints: dst_c.warp.src,
			frames: [],
			currentFrame: this.currentFrame
		};

		this.frames.forEach(frame => {
			console.log(frame);
			stateData.frames.push({
				colors: frame.getColors(),
				colorPoints: frame.getColorPoints(),
				distortionPoints: frame.getDistortionPoints(),
				pointCount: frame.getPointCount()
			});
		});

		const stateHash = btoa(JSON.stringify(stateData));

		const urlParams = new URLSearchParams(window.location.search);
		urlParams.set('s', stateHash);
		window.history.replaceState({}, '', `${window.location.pathname}?${urlParams.toString()}`);
	}

	loadURLState() {
		const urlParams = new URLSearchParams(window.location.search);
		const stateData = JSON.parse(atob(urlParams.get('s')));

		colors = stateData.colors;

		warps.removeAll();
		warps.setData(stateData.srcPoints, stateData.dstPoints, stateData.pointCount);

		this.frames = [];

		stateData.frames.forEach(frame => {
			const meshGradientFrame = new MeshGradientFrame();
			meshGradientFrame.setColors(frame.colors);
			meshGradientFrame.setColorPoints(frame.colorPoints);
			meshGradientFrame.setDistortionPoints(frame.distortionPoints);
			meshGradientFrame.setPointCount(frame.pointCount);
			this.frames.push(meshGradientFrame);
		});

		this.loadFrame(stateData.currentFrame);
	}

	transitionToFrame(frame) {
		if (this.frames[frame] === undefined) {
			console.log("Frame not found");
			return;
		}

		// Prepare values
		this._transitionFromState = {
			colors: JSON.parse(JSON.stringify(this.frames[this.currentFrame].getColors())),
			colorPoints: JSON.parse(JSON.stringify(this.frames[this.currentFrame].getColorPoints())),
			distortionPoints: JSON.parse(JSON.stringify(this.frames[this.currentFrame].getDistortionPoints()))
		}

		this._transitionToState = {
			colors: JSON.parse(JSON.stringify(this.frames[frame].getColors())),
			colorPoints: JSON.parse(JSON.stringify(this.frames[frame].getColorPoints())),
			distortionPoints: JSON.parse(JSON.stringify(this.frames[frame].getDistortionPoints()))
		}

		// Start animation
		this._transitionStartTime = Date.now();
		console.log(this._transitionToState);
		this._transitionTick();
		setTimeout(() => {
			this.loadFrame(frame);
		}, this.transitionDuration);

	}

	_transitionTick() {
		this._transitionElapsedTime = Date.now() - this._transitionStartTime;


		// Get current colors
		const current_tlRGB = hexToRgb(this._transitionFromState.colors.tl);
		const current_trRGB = hexToRgb(this._transitionFromState.colors.tr);
		const current_blRGB = hexToRgb(this._transitionFromState.colors.bl);
		const current_brRGB = hexToRgb(this._transitionFromState.colors.br);

		// Get target colors
		const target_tlRGB = hexToRgb(this._transitionToState.colors.tl);
		const target_trRGB = hexToRgb(this._transitionToState.colors.tr);
		const target_blRGB = hexToRgb(this._transitionToState.colors.bl);
		const target_brRGB = hexToRgb(this._transitionToState.colors.br);

		// Use easing to get delta values
		// TL
		const delta_tlR = Math.floor(easeInOutQuad(this._transitionElapsedTime, current_tlRGB.r, target_tlRGB.r - current_tlRGB.r, this.transitionDuration));
		const delta_tlG = Math.floor(easeInOutQuad(this._transitionElapsedTime, current_tlRGB.g, target_tlRGB.g - current_tlRGB.g, this.transitionDuration));
		const delta_tlB = Math.floor(easeInOutQuad(this._transitionElapsedTime, current_tlRGB.b, target_tlRGB.b - current_tlRGB.b, this.transitionDuration));
		// TR
		const delta_trR = Math.floor(easeInOutQuad(this._transitionElapsedTime, current_trRGB.r, target_trRGB.r - current_trRGB.r, this.transitionDuration));
		const delta_trG = Math.floor(easeInOutQuad(this._transitionElapsedTime, current_trRGB.g, target_trRGB.g - current_trRGB.g, this.transitionDuration));
		const delta_trB = Math.floor(easeInOutQuad(this._transitionElapsedTime, current_trRGB.b, target_trRGB.b - current_trRGB.b, this.transitionDuration));
		// BL
		const delta_blR = Math.floor(easeInOutQuad(this._transitionElapsedTime, current_blRGB.r, target_blRGB.r - current_blRGB.r, this.transitionDuration));
		const delta_blG = Math.floor(easeInOutQuad(this._transitionElapsedTime, current_blRGB.g, target_blRGB.g - current_blRGB.g, this.transitionDuration));
		const delta_blB = Math.floor(easeInOutQuad(this._transitionElapsedTime, current_blRGB.b, target_blRGB.b - current_blRGB.b, this.transitionDuration));
		// BR
		const delta_brR = Math.floor(easeInOutQuad(this._transitionElapsedTime, current_brRGB.r, target_brRGB.r - current_brRGB.r, this.transitionDuration));
		const delta_brG = Math.floor(easeInOutQuad(this._transitionElapsedTime, current_brRGB.g, target_brRGB.g - current_brRGB.g, this.transitionDuration));
		const delta_brB = Math.floor(easeInOutQuad(this._transitionElapsedTime, current_brRGB.b, target_brRGB.b - current_brRGB.b, this.transitionDuration));

		// Apply delta values to current colors
		colors.tl = RGBtoHex(delta_tlR, delta_tlG, delta_tlB);
		colors.tr = RGBtoHex(delta_trR, delta_trG, delta_trB);
		colors.bl = RGBtoHex(delta_blR, delta_blG, delta_blB);
		colors.br = RGBtoHex(delta_brR, delta_brG, delta_brB);

		// src - points
		this._transitionFromState.colorPoints.forEach((point, pointIndex) => {
			const toState = this._transitionToState.colorPoints[pointIndex];
			const pointX = easeInOutQuad(this._transitionElapsedTime, point[0], toState[0] - point[0], this.transitionDuration);
			const pointY = easeInOutQuad(this._transitionElapsedTime, point[1], toState[1] - point[1], this.transitionDuration);
			src_c.warp.src[pointIndex] = [pointX, pointY];
		});

		// dst - points
		this._transitionFromState.distortionPoints.forEach((point, pointIndex) => {
			const toState = this._transitionToState.distortionPoints[pointIndex];
			const pointX = easeInOutQuad(this._transitionElapsedTime, point[0], toState[0] - point[0], this.transitionDuration);
			const pointY = easeInOutQuad(this._transitionElapsedTime, point[1], toState[1] - point[1], this.transitionDuration);
			dst_c.warp.src[pointIndex] = [pointX, pointY];
		});

		// Call easing function
		// Update and redraw
		warps.update();
		redraw();
		// Tick if not finished
		console.log(this._transitionElapsedTime, this.transitionDuration);
		if (this._transitionElapsedTime < this.transitionDuration) {
			requestAnimationFrame(() => { this._transitionTick() });
		}
	}
}

class MeshGradientFrame {
	colorsMap = {};
	distortionPoints = [];
	colorPoints = [];
	pointCount = 0;

	setColors(colorsMap) {
		this.colorsMap = colorsMap;
	}

	getColors() {
		return this.colorsMap;
	}

	setPointCount(pointCount) {
		this.pointCount = pointCount;
	}

	getPointCount() {
		return this.pointCount;
	}

	setDistortionPoints(distortionPoints) {
		this.distortionPoints = distortionPoints;
	}

	getDistortionPoints() {
		return this.distortionPoints;
	}

	setColorPoints(colorPoints) {
		this.colorPoints = colorPoints;
	}

	getColorPoints() {
		return this.colorPoints;
	}
}

let meshGradient;
function initMeshGradientJS() {
	meshGradient = new MeshGradientTimeline();
}