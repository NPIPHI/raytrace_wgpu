import { vec2, vec3 } from "gl-matrix";
import { Extent } from "./Extent";

export class Triangle {
    constructor(
        public v0: vec3, public v1: vec3, public v2: vec3,
        public n0: vec3, public n1: vec3, public n2: vec3,
        public emit_color: vec3,
        public uv0: vec2, public uv1: vec2, public uv2: vec2,
        public mat_idx: number
        ){}

    static default(): Triangle {
        const z: vec3  = [0,0,0]
        const z2: vec2 = [0,0]
        return new Triangle(z,z,z,z,z,z,z,z2,z2,z2,0);
    }

    write_vertex(arr: Float32Array, offset: number){
        arr[offset+0] = this.v0[0];
        arr[offset+1] = this.v0[1];
        arr[offset+2] = this.v0[2];
        arr[offset+3] = this.n0[0];
        arr[offset+4] = this.n0[1];
        arr[offset+5] = this.n0[2];
        
        arr[offset+6] = this.v1[0];
        arr[offset+7] = this.v1[1];
        arr[offset+8] = this.v1[2];
        arr[offset+9] = this.n1[0];
        arr[offset+10] = this.n1[1];
        arr[offset+11] = this.n1[2];

        arr[offset+12] = this.v2[0];
        arr[offset+13] = this.v2[1];
        arr[offset+14] = this.v2[2];
        arr[offset+15] = this.n2[0];
        arr[offset+16] = this.n2[1];
        arr[offset+17] = this.n2[2];
    }

    write_raytrace(arr: Float32Array, offset: number){
        arr[offset+0] = this.v0[0];
        arr[offset+1] = this.v0[1];
        arr[offset+2] = this.v0[2];
        arr[offset+3] = 0;

        arr[offset+4] = this.v1[0];
        arr[offset+5] = this.v1[1];
        arr[offset+6] = this.v1[2];
        arr[offset+7] = 0;

        arr[offset+8] = this.v2[0];
        arr[offset+9] = this.v2[1];
        arr[offset+10] = this.v2[2];
        arr[offset+11] = 0;
    }

    static vertex_size() {
        return 18;
    }

    static raytrace_size() {
        return 12;
    }

    static query_cost(): number {
        return 1;
    }

    center(): vec3 {
        return [
            (this.v0[0] + this.v1[0] + this.v2[0])/3,
            (this.v0[1] + this.v1[1] + this.v2[1])/3,
            (this.v0[2] + this.v1[2] + this.v2[2])/3,
        ]
    }

    min(): vec3 {
        return [
            Math.min(this.v0[0], this.v1[0], this.v2[0]),
            Math.min(this.v0[1], this.v1[1], this.v2[1]),
            Math.min(this.v0[2], this.v1[2], this.v2[2]),
        ]
    }

    max(): vec3 {
        return [
            Math.max(this.v0[0], this.v1[0], this.v2[0]),
            Math.max(this.v0[1], this.v1[1], this.v2[1]),
            Math.max(this.v0[2], this.v1[2], this.v2[2]),
        ]
    }

    extent(): Extent {
        return new Extent(
            [
                Math.min(this.v0[0], this.v1[0], this.v2[0]),
                Math.min(this.v0[1], this.v1[1], this.v2[1]),
                Math.min(this.v0[2], this.v1[2], this.v2[2]),
            ],
            [
                Math.max(this.v0[0], this.v1[0], this.v2[0]),
                Math.max(this.v0[1], this.v1[1], this.v2[1]),
                Math.max(this.v0[2], this.v1[2], this.v2[2]),
            ]
        )
    }
}