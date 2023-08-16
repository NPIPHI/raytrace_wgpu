@group(0) @binding(0)
var<uniform> settings: Settings;

@group(0) @binding(1)
var<storage, read_write> framebuffer: FrameBuffer;

@group(0) @binding(2)
var<storage, read_write> scheduled_out: RayQueue;

var<private> rng_seed: u32 = 0;

struct Settings {
    cam: mat4x4f,
    pos: vec3f,
    aspect: f32,
    frame_count: u32,
    dirty: u32,
    sample_count: u32,
}

struct FrameBuffer {
    width: u32,
    height: u32,
    pad1: u32,
    pad2: u32,
    pixels: array<vec4f>,
}

struct Ray {
    pos: vec3f,
    dir: vec3f,
    dst_ptr: u32,
    color_attenuation: vec3f,
}

struct RayQueue {
    head_ptr: atomic<u32>,
    rays: array<Ray>,
}

override wg_dim: u32;

@compute @workgroup_size(wg_dim, wg_dim)
fn main(
    @builtin(global_invocation_id)
    global_id : vec3u,
){
    if(global_id.x >= framebuffer.width || global_id.y >= framebuffer.height){
        return;
    }

    if(settings.dirty == 1){
        framebuffer.pixels[global_id.x + framebuffer.width * global_id.y] = vec4f(0);
    }

    seed_rng(global_id.xy);

    let x = 2 * (rand_float() + f32(global_id.x)) / f32(framebuffer.width) - 1;
    let y = 2 * (rand_float() + f32(global_id.y)) / f32(framebuffer.height) - 1;
    let screen_space_vec = vec4f(x*settings.aspect*settings.aspect, y, 1, 0);

    let dir = normalize((screen_space_vec * settings.cam).xyz);
    let pos = settings.pos;
    let dst_ptr = global_id.x + framebuffer.width * global_id.y;
    let idx = atomicAdd(&scheduled_out.head_ptr, 1);

    scheduled_out.rays[idx] = Ray(pos, dir, dst_ptr, vec3f(1));
}

fn seed_rng(global_id: vec2u) {
    rng_seed = global_id.x * 4096 + global_id.y * 4096 * 4096 + settings.frame_count;
}

fn pcg_hash(input: u32) -> u32 {
    let state = input * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn rand_float() -> f32 {
    rng_seed = pcg_hash(rng_seed);
    return f32(rng_seed) / f32(0xffffffffu);
}