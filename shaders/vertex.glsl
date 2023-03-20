precision mediump float;
attribute vec4 a_Position;
attribute vec2 a_TexCoord;

varying vec2 texco;

void main()
{
    texco = a_TexCoord;
    gl_Position = a_Position;
}