@group(0) @binding(0)
var<uniform> settings: Settings;

@group(0) @binding(1)
var<storage, read_write> framebuffer: FrameBuffer;

@group(0) @binding(2)
var<storage, read> bvh_tree: array<BVHNode>;

@group(0) @binding(3)
var<storage, read> bvh_triangles: array<Triangle>;

var<private> rng_seed: u32 = 0;
const PI: f32 = 3.14159265358979323846264338;

struct Settings {
    cam: mat4x4f,
    pos: vec3f,
    aspect: f32,
    frame_count: u32,
    dirty: u32,
    sample_count: u32,
}

struct BVHNode {
    min_extent: vec3f, tri_count: u32, // > 0 if leaf
    max_extent: vec3f, right_ptr: u32, //tri_ptr if leaf
}

struct Triangle {
    v0: vec3f, emit_r: f32,
    v1: vec3f, emit_g: f32,
    v2: vec3f, emit_b: f32,
}

struct FrameBuffer {
    width: u32,
    height: u32,
    pad1: u32,
    pad2: u32,
    pixels: array<vec4f>,
}

struct RayIntersect {
    norm: vec3f,
    dist: f32,
    hit: bool,
    tri_id: u32,
}

override wg_dim: u32;

@compute @workgroup_size(wg_dim, wg_dim)
fn main(
    @builtin(global_invocation_id)
    global_id : vec3u,

    @builtin(local_invocation_id)
    local_id : vec3u,
){
    if(global_id.x >= framebuffer.width || global_id.y >= framebuffer.height){
        return;
    }
    
    if(settings.dirty == 1){
        framebuffer.pixels[global_id.x + framebuffer.width * global_id.y] = vec4f(0);
    }

    //if((global_id.x / 8 + global_id.y / 8 + settings.frame_count) % 16 != 0){
    //    return;
    //}

    seed_rng(global_id.xy);

    var color = vec4f();

    for(var i = 0u; i < settings.sample_count; i++){
        color += compute_color(global_id.xy);
    }
    
    framebuffer.pixels[global_id.x + framebuffer.width * global_id.y] += color;
}

fn compute_color(global_id: vec2u) -> vec4f {
    let x = 2 * (rand_float() + f32(global_id.x)) / f32(framebuffer.width) - 1;
    let y = 2 * (rand_float() + f32(global_id.y)) / f32(framebuffer.height) - 1;

    let screen_space_vec = vec4f(x*settings.aspect*settings.aspect, y, 1, 0);
    var out: vec4f = vec4f(0,0,0,1);


    var dir = normalize((screen_space_vec * settings.cam).xyz);
    var pos = settings.pos;

    var color = vec3f(0,0,0);
    var absorption = vec3f(1,1,1);

    for(var i = 0; i < 4; i++){
        let hit = nearest_intersect_bvh(pos, dir);
        if(hit.hit) {
            let tri = bvh_triangles[hit.tri_id];
            color += absorption * vec3f(tri.emit_r, tri.emit_g, tri.emit_b);
            var norm = hit.norm;
            if(dot(norm, dir) > 0){
                norm = -norm;
            }
            pos = pos + dir * hit.dist;
            if(rand_float() < 0.9) {
                dir = rand_sphere_hemisphere(norm);
                absorption *= dot(norm, dir);
            } else {
                let h = rand_sphere_hemisphere(norm);
                let reflect = dir - 2 * norm * dot(norm, dir);
                let mix = h * 0.03 + reflect;
                dir = normalize(mix);
            }
        } else {
            color += absorption * vec3f(50) * exp(40*(dir.z - 1));
            break;
        }
    }

    return vec4f(color, 1);
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

fn rand_normal() -> f32 {
    let u1 = rand_float();
    let u2 = rand_float();
    let z1 = sqrt(-2 * log(u1)) * cos(2 * PI * u2);
    return z1;
}

fn rand_sphere_surface() -> vec3f {
    return normalize(vec3f(rand_normal(), rand_normal(), rand_normal()));
}

fn rand_sphere_hemisphere(dir: vec3f) -> vec3f {
    let pt = rand_sphere_surface();
    if(dot(pt, dir) < 0){
        return -pt;
    } else {
        return pt;
    }
}

fn nearest_intersect(ray_origin: vec3f, ray_vec: vec3f) -> RayIntersect {
    var hit: RayIntersect;
    let triangle_ct = arrayLength(&bvh_triangles);
    for(var i = 0u; i < triangle_ct; i++){
        let inter = ray_tri_intersect(ray_origin, ray_vec, bvh_triangles[i]);
        if(inter.hit && (!hit.hit || inter.dist < hit.dist)){
            hit = inter;
            hit.tri_id = i;
        }
    }
    return hit;
}

fn nearest_intersect_bvh_leaf(leaf: BVHNode, ray_origin: vec3f, ray_vec: vec3f) -> RayIntersect {
    let ct = leaf.tri_count;
    let ptr = leaf.right_ptr;

    var hit: RayIntersect;
    for(var i = ptr; i < ptr + ct; i++){
        let inter = ray_tri_intersect(ray_origin, ray_vec, bvh_triangles[i]);
        if(inter.hit && (!hit.hit || inter.dist < hit.dist)){
            hit = inter;
            hit.tri_id = u32(i);
        }
    }
    return hit;
}

fn nearest_intersect_bvh(ray_origin: vec3f, ray_vec: vec3f) -> RayIntersect {
    var stack = array<u32, 32>();
    var stack_ptr = 0;
    let inv_v = 1.0 / ray_vec;
    let sign = vec3i(ray_vec < vec3f(0));
    var limit = 0;
    var best_hit = RayIntersect();
    best_hit.dist = 1000000.0;
    while(stack_ptr >= 0 && limit < 1000) {
        limit++;
        let node_idx = stack[stack_ptr];
        let node = bvh_tree[node_idx];
        if(ray_cube_intersect(ray_origin, ray_vec, inv_v, sign, node.min_extent, node.max_extent, best_hit.dist)){
            if(node.tri_count > 0){ // internal node
                let hit = nearest_intersect_bvh_leaf(node, ray_origin, ray_vec);
                if(hit.hit && hit.dist < best_hit.dist) {
                    best_hit = hit;
                }
                stack_ptr--;
            } else {
                let left = node_idx+1;
                let right = node.right_ptr;
                if(dot(bvh_tree[left].min_extent, ray_vec) < dot(bvh_tree[right].min_extent, ray_vec)){
                    stack[stack_ptr] = right;
                    stack[stack_ptr+1] = left;
                } else {
                    stack[stack_ptr] = left;
                    stack[stack_ptr+1] = right;
                }
                
                stack_ptr++;
            }
        } else {
            stack_ptr--;
        }
    }

    return best_hit;
}


fn ray_tri_intersect(ray_origin: vec3f, ray_vec: vec3f, tri: Triangle) -> RayIntersect {
    const EPSILON = 0.0001;
    let edge1 = tri.v1 - tri.v0;
    let edge2 = tri.v2 - tri.v0;
    let h = cross(ray_vec, edge2);
    let a = dot(edge1, h);
    if(a > -EPSILON && a < EPSILON){
        return RayIntersect();
    }

    let f = 1.0 / a;
    let s = ray_origin - tri.v0;
    let u = f * dot(s, h);

    if(u < 0.0 || u > 1.0){
        return RayIntersect();
    }

    let q = cross(s, edge1);
    let v = f * dot(ray_vec, q);

    if(v < 0.0 || u + v > 1.0){
        return RayIntersect();
    }

    let t = f * dot(edge2, q);
    if(t > EPSILON) {
        return RayIntersect(normalize(cross(edge1, edge2)), t, true, 0);
    } else {
        return RayIntersect();
    }
}


fn ray_cube_intersect(ray_origin: vec3f, ray_vec: vec3f, inv_ray_vec: vec3f, sign: vec3i, cube_min: vec3f, cube_max: vec3f, max_dist: f32) -> bool {
    let bounds = array(cube_min, cube_max);

    var tmin = (bounds[sign.x].x - ray_origin.x) * inv_ray_vec.x;
    var tmax = (bounds[1-sign.x].x - ray_origin.x) * inv_ray_vec.x;
    let tymin = (bounds[sign.y].y - ray_origin.y) * inv_ray_vec.y;
    let tymax = (bounds[1-sign.y].y - ray_origin.y) * inv_ray_vec.y;

    if( (tmin > tymax) || (tymin > tmax)) {
        return false;
    }

    if(tymin > tmin) {
        tmin = tymin;
    }

    if(tymax < tmax) {
        tmax = tymax;
    }
    let tzmin = (bounds[sign.z].z - ray_origin.z) * inv_ray_vec.z;
    let tzmax = (bounds[1-sign.z].z - ray_origin.z) * inv_ray_vec.z;

    if( (tmin > tzmax) || (tzmin > tmax)) {
        return false;
    }

    if(tzmin > tmin) {
        tmin = tzmin;
    }

    if(tzmax < tmax) {
        tmax = tzmax;
    }

    let t0 = 0.0;

    return (tmin < max_dist) && (tmax > t0);
}