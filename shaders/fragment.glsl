#define MAX_POINTS 16

precision mediump float;

uniform sampler2D texture;
uniform vec2 points[MAX_POINTS];
uniform float s2[MAX_POINTS];
uniform vec2 w[MAX_POINTS];
uniform int npoints;
uniform int warp;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;
varying vec2 texco;

uniform int u_color1;
uniform int u_color2;
uniform int u_color3;
uniform int u_color4;

vec4 getColor(int c) {
    float rValue = float(c / 256 / 256);
    float gValue = float(c / 256 - int(rValue * 256.0));
    float bValue = float(c - int(rValue * 256.0 * 256.0) - int(gValue * 256.0));
    return vec4(rValue / 255.0, gValue / 255.0, bValue / 255.0, 1.0);
}

vec4 grad(vec2 uv) {
    
	vec4 color0 = getColor(u_color1); // EAD292
    vec4 color1 = getColor(u_color2); // 7EB1A8
    vec4 color2 = getColor(u_color3); // FDAB89
    vec4 color3 = getColor(u_color4); // DB0C36
 
    // coordinates
    vec2 P0 = vec2(0.31,0.3);
    vec2 P1 = vec2(0.7,0.32);
    vec2 P2 = vec2(0.28,0.71);
    vec2 P3 = vec2(0.72,0.75);
 
    vec2 Q = P0 - P2;
    vec2 R = P1 - P0;
    vec2 S = R + P2 - P3;
    vec2 T = P0 - uv;
 
    float u;
    float t;
 
    if(Q.x == 0.0 && S.x == 0.0) {
        u = -T.x/R.x;
        t = (T.y + u*R.y) / (Q.y + u*S.y);
    } else if(Q.y == 0.0 && S.y == 0.0) {
        u = -T.y/R.y;
        t = (T.x + u*R.x) / (Q.x + u*S.x);
    } else {
        float A = S.x * R.y - R.x * S.y;
        float B = S.x * T.y - T.x * S.y + Q.x*R.y - R.x*Q.y;
        float C = Q.x * T.y - T.x * Q.y;
        if(abs(A) < 0.0001)
            u = -C/B;
        else
        u = (-B+sqrt(B*B-4.0*A*C))/(2.0*A);
        t = (T.y + u*R.y) / (Q.y + u*S.y);
    }
    u = clamp(u,0.0,1.0);
    t = clamp(t,0.0,1.0);
 

    t = smoothstep(0.0, 1.0, t);
    u = smoothstep(0.0, 1.0, u);
 
    vec4 colorA = mix(color0,color1,u);
    vec4 colorB = mix(color2,color3,u);
    
    return mix(colorA, colorB, t);
}

void main()
{
	
    if (warp > 0) {
	vec2 p = texco * 2.0 - 1.0;
	vec2 q = vec2(0, 0);
	for (int i = 0; i < MAX_POINTS; i++) {
	    if (i >= npoints)
		continue;
	    vec2 points_i = points[i];
	    float s2_i = s2[i];
	    vec2 w_i = w[i];
	    vec2 delta = p - points_i;
	    float distsq = dot(delta, delta);
	    float H_i = sqrt(distsq + s2_i);
	    q += H_i * w_i;
	}
        
	gl_FragColor = grad((q + 1.0) / 2.0);
    }
    else {
	gl_FragColor = grad(texco);

    }
}