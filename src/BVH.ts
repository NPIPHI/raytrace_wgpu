import { vec3 } from "gl-matrix";
import { Triangle } from "./Triangle";
import { Extent } from "./Extent";

type BVHNode = BVHInternal | BVHLeaf;

class BVHInternal {
    constructor(public readonly extent: Extent, public readonly child1: BVHNode, public readonly child2: BVHNode){}
}

class BVHLeaf {
    constructor(public readonly extent: Extent, public readonly triangles: Triangle[]){}
}

const DEBUG_INDICES = [
    [0,1,2],
    [3,1,2],
    [0,4,2],
    [3,4,2],
    [0,1,5],
    [3,1,5],
    [0,4,5],
    [3,4,5],
]

const DEBUG_FACES = [
    [2, 6, 7],
    [2, 3, 7],
    [0, 4, 5],
    [0, 1, 5],
    [0, 2, 6],
    [0, 4, 6],
    [1, 3, 7],
    [1, 5, 7],
    [0, 2, 3],
    [0, 1, 3],
    [4, 6, 7],
    [4, 5, 7]
]

function partition<T>(arr: T[], pred: (_:T)=>boolean): [T[], T[]] {
    let l = [];
    let r = [];
    for(let i = 0; i < arr.length; i++){
        if(pred(arr[i])){
            l.push(arr[i]);
        } else {
            r.push(arr[i]);
        }
    }
    return [l,r];
}

export class BVH {
    private root: BVHNode;
    private tri_count: number;
    private target_node_size: number = 6;
    private bucket_count: number = 20;
    constructor(tris: Triangle[]){
        this.root = this.build_tree(tris);
        this.tri_count = tris.length;
        this.validate(tris);        
    }

    private validate(input_tris: Triangle[]) {
        const verify_extent = (n: BVHNode)=>{
            if(n instanceof BVHInternal){
                if(!n.extent.encloses(n.child1.extent)){
                    throw new Error("unenclosed extent");
                }
                if(!n.extent.encloses(n.child2.extent)){
                    throw new Error("unenclosed extent");
                }
            } else {
                n.triangles.forEach(t=>{
                    if(!n.extent.encloses(t.extent())){
                        throw new Error("unenclosed triangle");
                    }
                })
            }
        }
        verify_extent(this.root);
        const extract_info = (n: BVHNode)=>{
            if(n instanceof BVHInternal){
                const l = extract_info(n.child1);
                const r = extract_info(n.child2);
                let tris = [...l[5],...r[5]];
                return [
                    1 + Math.max(l[0], r[0]),
                    l[1] + r[1],
                    Math.max(l[2], r[2]),
                    l[3] + r[3] + 1,
                    l[4].triangles.length > r[4].triangles.length ? l[4] : r[4],
                    tris,
                    2 + (n.child1.extent.surface_area() * l[6] + n.child2.extent.surface_area() * r[6]) / n.extent.surface_area()   ,
                ]
            } else {
                return [1, n.triangles.length, n.triangles.length, 1, n, n.triangles, this.sah_cost(n.triangles)];
            }
        }
        const [max_depth, total_tris, largest_leaf, total_nodes, biggest_node, triangles, sah_cost] = extract_info(this.root);
        if(total_tris != input_tris.length){
            throw new Error("Missing Triangles");
        }
        console.log({max_depth, total_tris, largest_leaf, total_nodes, biggest_node});
        console.log({sah_cost: sah_cost/1000})
    }

    private static extent(tris: Triangle[]): Extent {
        if(tris.length == 0){
            throw new Error("Empty Triangle List");
        }
        let e = tris[0].extent();
        for(let i = 1; i < tris.length; i++){
            e.union(tris[i].extent());
        }

        return e;
    }

    private sah_cost(tris: Triangle[]): number {
        if(tris.length == 0) return 0;
        const extent = BVH.extent(tris);
        return extent.surface_area() * tris.length * Triangle.query_cost();
    }

    private split_midpoint(tris: Triangle[]): [Triangle[], Triangle[]] {
        const extent = BVH.extent(tris);
        const size = extent.size();
        let biggest_axis = 0;
        if(size[0] > size[1] && size[0] > size[2]){
            biggest_axis = 0;
        } else if(size[1] > size[2]){
            biggest_axis = 1;
        } else {
            biggest_axis = 2;
        }

        let partition_point = extent.center()[biggest_axis];

        return partition(tris, tri=>tri.center()[biggest_axis] < partition_point);
    }


    private split_sah(tris: Triangle[]): [Triangle[], Triangle[]] {
        const extent = BVH.extent(tris);
        const size = extent.size();
        let best_cost = Infinity;
        let left = [];
        let right = [];

        for(let axis = 0; axis < 3; axis++){
            for(let b = 0; b < this.bucket_count; b++){
                let pos = extent.ext[axis] + size[axis] * b / (this.bucket_count-1);
                let [l,r] = partition(tris, tri=>tri.center()[axis] < pos);
                let cost = this.sah_cost(l) + this.sah_cost(r);
                if(cost < best_cost){
                    best_cost = cost;
                    left = l;
                    right = r;
                }
            }
        }

        return [left, right];
    }

    private split_sah2(tris: Triangle[]): [Triangle[], Triangle[]] {
        const extent = BVH.extent(tris);
        const size = extent.size();
        let best_cost = Infinity;
        let left = [];
        let right = [];

        for(let axis = 0; axis < 3; axis++){
            for(let b = 0; b < this.bucket_count; b++){
                let pos = extent.ext[axis] + size[axis] * b / (this.bucket_count-1);
                let [l,r] = partition(tris, tri=>tri.min()[axis] < pos);
                let cost = this.sah_cost(l) + this.sah_cost(r);
                if(cost < best_cost){
                    best_cost = cost;
                    left = l;
                    right = r;
                }
            }
        }

        return [left, right];
    }

    private build_tree(tris: Triangle[]): BVHNode {
        if(tris.length == 0) {
            throw new Error("Empty Tris List");
        }

        const extent = BVH.extent(tris);

        if(tris.length < this.target_node_size) {
            return new BVHLeaf(extent, tris);
        }

        // const [left, right] = this.split_midpoint(tris);
        // const [left, right] = this.split_sah(tris);
        const [left, right] = this.split_sah2(tris);

        if(left.length == 0) {
            return new BVHLeaf(extent, right);
        }
        if(right.length == 0) {
            return new BVHLeaf(extent, left);
        }
        return new BVHInternal(extent, this.build_tree(left), this.build_tree(right));
    }

    serialize_debug(): ArrayBuffer {
        const tris: Triangle[] = [];
        const visit = (n: BVHNode, depth: number) => {
            if(n instanceof BVHInternal){
                visit(n.child1, depth+1);
                visit(n.child2, depth+1);
            }

            const color:vec3 = [depth%2, (depth/2|0)%2, (depth/4|0)%2];

            DEBUG_FACES.forEach(face=>{
                tris.push(new Triangle(
                    [n.extent.ext[DEBUG_INDICES[face[0]][0]],n.extent.ext[DEBUG_INDICES[face[0]][1]],n.extent.ext[DEBUG_INDICES[face[0]][2]]],
                    [n.extent.ext[DEBUG_INDICES[face[1]][0]],n.extent.ext[DEBUG_INDICES[face[1]][1]],n.extent.ext[DEBUG_INDICES[face[1]][2]]],
                    [n.extent.ext[DEBUG_INDICES[face[2]][0]],n.extent.ext[DEBUG_INDICES[face[2]][1]],n.extent.ext[DEBUG_INDICES[face[2]][2]]],
                    color, color, color
                ));
            })
        }
        visit(this.root, 0);

        const buff = new Float32Array(Triangle.vertex_size() * tris.length);

        tris.forEach((tri, i)=>tri.write_vertex(buff, i * Triangle.vertex_size()));

        return buff;
    }

    serialize(): {tree: ArrayBuffer, tris: ArrayBuffer} {
        const NODE_SIZE = 8;
        const TRI_SIZE = 12;

        const flat_nodes: {node: BVHNode, left?: number, right?: number}[] = [];
        const visit = (n: BVHNode)=>{
            if(n instanceof BVHInternal){
                const idx = flat_nodes.length;
                const item = {node: n, left: 0, right: 0};
                flat_nodes.push(item);
                item.left = visit(n.child1);
                item.right = visit(n.child2);
                return idx;
            } else {
                const idx = flat_nodes.length;
                const item = {node: n};
                flat_nodes.push(item);
                return idx;
            }
        }
        visit(this.root);

        const triangle_buffer = new Float32Array(this.tri_count * TRI_SIZE);
        const tree_buffer = new ArrayBuffer(flat_nodes.length * NODE_SIZE * 4);
        const f32_tree_buffer = new Float32Array(tree_buffer);
        const u32_tree_buffer = new Uint32Array(tree_buffer);

        let triangle_ptr = 0;

        const insert_triangle = (tri: Triangle, ptr: number)=>{
            triangle_buffer[ptr * TRI_SIZE + 0 ] = tri.v0[0];
            triangle_buffer[ptr * TRI_SIZE + 1 ] = tri.v0[1];
            triangle_buffer[ptr * TRI_SIZE + 2 ] = tri.v0[2];
            triangle_buffer[ptr * TRI_SIZE + 3 ] = tri.emit_color[0];
            triangle_buffer[ptr * TRI_SIZE + 4 ] = tri.v1[0];
            triangle_buffer[ptr * TRI_SIZE + 5 ] = tri.v1[1];
            triangle_buffer[ptr * TRI_SIZE + 6 ] = tri.v1[2];
            triangle_buffer[ptr * TRI_SIZE + 7 ] = tri.emit_color[1];
            triangle_buffer[ptr * TRI_SIZE + 8 ] = tri.v2[0];
            triangle_buffer[ptr * TRI_SIZE + 9 ] = tri.v2[1];
            triangle_buffer[ptr * TRI_SIZE + 10] = tri.v2[2];
            triangle_buffer[ptr * TRI_SIZE + 11] = tri.emit_color[2];
        }

        for(let i = 0; i < flat_nodes.length; i++){
            const {node, left, right} = flat_nodes[i];
            if(node instanceof BVHInternal) {
                if(left != i + 1){
                    throw new Error("Bad tree order");
                }
                f32_tree_buffer[i * NODE_SIZE + 0] = node.extent.ext[0];
                f32_tree_buffer[i * NODE_SIZE + 1] = node.extent.ext[1];
                f32_tree_buffer[i * NODE_SIZE + 2] = node.extent.ext[2];
                u32_tree_buffer[i * NODE_SIZE + 3] = 0;
                f32_tree_buffer[i * NODE_SIZE + 4] = node.extent.ext[3];
                f32_tree_buffer[i * NODE_SIZE + 5] = node.extent.ext[4];
                f32_tree_buffer[i * NODE_SIZE + 6] = node.extent.ext[5];
                u32_tree_buffer[i * NODE_SIZE + 7] = right;
            } else {
                f32_tree_buffer[i * NODE_SIZE + 0] = node.extent.ext[0];
                f32_tree_buffer[i * NODE_SIZE + 1] = node.extent.ext[1];
                f32_tree_buffer[i * NODE_SIZE + 2] = node.extent.ext[2];
                u32_tree_buffer[i * NODE_SIZE + 3] = node.triangles.length;
                f32_tree_buffer[i * NODE_SIZE + 4] = node.extent.ext[3];
                f32_tree_buffer[i * NODE_SIZE + 5] = node.extent.ext[4];
                f32_tree_buffer[i * NODE_SIZE + 6] = node.extent.ext[5];
                u32_tree_buffer[i * NODE_SIZE + 7] = triangle_ptr;

                for(let t = 0; t < node.triangles.length; t++){
                    insert_triangle(node.triangles[t], triangle_ptr);
                    triangle_ptr++;
                }
            }
        }

        return {tree: tree_buffer, tris: triangle_buffer.buffer};
    }
}