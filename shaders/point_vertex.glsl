precision mediump float;

uniform float radius;

attribute vec4 a_Position;
uniform vec2 u_mouse;
uniform vec2 u_resolution;

void main()
{
    if (u_mouse.x < ((2. + a_Position.x) / 2.) * u_resolution.x) {
        gl_PointSize = radius * 2.;
    } else {
        gl_PointSize = radius;
    }
    gl_Position = a_Position;    
}