@group(0) @binding(0)
var<storage, read> framebuffer: FrameBuffer;

struct FrameBuffer {
    width: u32,
    height: u32,
    pad1: u32,
    pad2: u32,
    pixels: array<vec4f>,
}

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}


@vertex
fn vertex_main(@location(0) position: vec2f, @location(1) uv: vec2f) -> VertexOut {
    var out: VertexOut;
    out.position = vec4f(position, 0, 1);
    out.uv = uv;
    return out;
}

fn luminance(color: vec3f) -> f32 {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

@fragment
fn fragment_main(data: VertexOut) -> @location(0) vec4f {
    let iuv = vec2u(data.uv * vec2f(f32(framebuffer.width), f32(framebuffer.height)));
    let sample0 = framebuffer.pixels[iuv.x + iuv.y * framebuffer.width];

    let sample = sample0;
    let color = sample.xyz/sample.w;
    let l = luminance(color);
    let tone_mappeed = color / (l + 1);
    return vec4f(tone_mappeed, 1);
}
