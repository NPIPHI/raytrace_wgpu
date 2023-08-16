import { vec3 } from "gl-matrix";

export class Extent {
    public ext: number[]
    constructor(min: vec3, max: vec3) {
        this.ext = [min[0], min[1], min[2], max[0], max[1], max[2]]
    }

    union(other: Extent) {
        this.ext[0] = Math.min(this.ext[0], other.ext[0]);
        this.ext[1] = Math.min(this.ext[1], other.ext[1]);
        this.ext[2] = Math.min(this.ext[2], other.ext[2]);
        this.ext[3] = Math.max(this.ext[3], other.ext[3]);
        this.ext[4] = Math.max(this.ext[4], other.ext[4]);
        this.ext[5] = Math.max(this.ext[5], other.ext[5]);
    }

    size(): vec3 {
        return [
            this.ext[3] - this.ext[0],
            this.ext[4] - this.ext[1],
            this.ext[5] - this.ext[2],
        ]
    }

    center(): vec3 {
        return [
            (this.ext[0] + this.ext[3])/2,
            (this.ext[1] + this.ext[4])/2,
            (this.ext[2] + this.ext[5])/2,
        ]
    }

    encloses(other: Extent): boolean {
        return this.ext[0] <= other.ext[0] 
        && this.ext[1] <= other.ext[1] 
        && this.ext[2] <= other.ext[2] 
        && this.ext[3] >= other.ext[3] 
        && this.ext[4] >= other.ext[4] 
        && this.ext[5] >= other.ext[5]
    }

    surface_area(): number {
        const x = this.ext[3] - this.ext[0];
        const y = this.ext[4] - this.ext[1];
        const z = this.ext[5] - this.ext[2];

        return (x * y + y * z + x * z) * 2;
    }
}