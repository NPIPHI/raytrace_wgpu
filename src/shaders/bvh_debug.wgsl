@group(0) @binding(0)
var<uniform> camera: mat4x4f;

struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) normal: vec3f,
    @location(1) nearness: vec3f,
}

@vertex
fn vertex_main(
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @builtin(vertex_index) vid: u32,
) -> VertexOut {
    var out: VertexOut;

    out.pos = camera * vec4f(position, 1);
    out.normal = normal;
    out.nearness[vid % 3] = 1;

    return out;
}

@fragment
fn fragment_main(
    data: VertexOut
) -> @location(0) vec4f {
    let x = data.nearness.x;
    let y = data.nearness.y;
    let z = data.nearness.z;
    if(max(x+y,y+z) < 0.99){
        discard;
    }
    return vec4f(data.normal,1);
}