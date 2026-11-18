"""Build the viewer's tree models in Blender: one GLB per species plus preview renders.

Run headless from the repo root (Blender 4.x or later):

    blender -b --factory-startup -P pipeline/scripts/make_plants_blender.py -- \
        --out viewer/public/assets/plants --preview <folder for PNGs> [--detailed]

The shapes come from pipeline/yelamu/plants.py (pure Python, tested with pytest); this file
only turns them into Blender meshes, exports and renders. Each GLB holds one mesh: positions,
normals and a linear COLOR_0, no materials or textures, y up, the tree standing on the
origin with its top at y = 1 (the viewer rescales to exactly 1 anyway).
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from yelamu.plants import DETAILED_RECIPES, RECIPES, SPECIES, Lump, Stem, lump_jitter, triangles  # noqa: E402


def to_blender(p) -> Vector:
    """Viewer frame (x, y up, z) to Blender (x, y, z up); the glTF exporter maps it back."""
    return Vector((p[0], -p[2], p[1]))


def add_stem(bm: bmesh.types.BMesh, color_layer, stem: Stem) -> None:
    base = to_blender(stem.base)
    tip = to_blender(stem.tip)
    axis = tip - base
    length = axis.length
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    m = Matrix.Translation((base + tip) / 2) @ rot
    made = bmesh.ops.create_cone(
        bm, cap_ends=False, cap_tris=False, segments=5, radius1=stem.r_base, radius2=stem.r_tip, depth=length, matrix=m
    )
    faces = {f for v in made["verts"] for f in v.link_faces}
    for f in faces:
        for loop in f.loops:
            loop[color_layer] = (*stem.color, 1.0)


def add_lump(bm: bmesh.types.BMesh, color_layer, lump: Lump) -> None:
    made = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    verts = made["verts"]
    jitter = lump_jitter(lump, len(verts))
    rx, ry, rz = lump.radii  # viewer frame: ry is the height
    turn = Matrix.Rotation(lump.turn, 4, "Z")
    centre = to_blender(lump.center)
    for v, f in zip(verts, jitter):
        local = v.co * f
        v.co = centre + (turn @ Vector((local.x * rx, local.y * rz, local.z * ry)))
    zs = [v.co.z for v in verts]
    z0, z1 = min(zs), max(zs)
    faces = {f for v in verts for f in v.link_faces}
    for face in faces:
        for loop in face.loops:
            t = (loop.vert.co.z - z0) / (z1 - z0) if z1 > z0 else 1.0
            k = lump.shade + (1 - lump.shade) * t
            loop[color_layer] = (lump.color[0] * k, lump.color[1] * k, lump.color[2] * k, 1.0)


def build(species: str, recipes=RECIPES) -> bpy.types.Object:
    parts = recipes[species]()
    mesh = bpy.data.meshes.new(species)
    bm = bmesh.new()
    color_layer = bm.loops.layers.float_color.new("Col")
    for p in parts:
        (add_stem if isinstance(p, Stem) else add_lump)(bm, color_layer, p)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # Unit height: top at z = 1, ground at z = 0 (the stems reach a little below).
    top = max(v.co.z for v in bm.verts)
    bmesh.ops.scale(bm, vec=(1 / top, 1 / top, 1 / top), verts=bm.verts[:])
    bm.to_mesh(mesh)
    bm.free()
    mesh.color_attributes.active_color = mesh.color_attributes["Col"]
    for poly in mesh.polygons:
        poly.use_smooth = False
    obj = bpy.data.objects.new(species, mesh)
    bpy.context.scene.collection.objects.link(obj)
    n = len(mesh.polygons)
    expected = triangles(parts)
    if n != expected:
        raise SystemExit(f"{species}: {n} triangles, recipe says {expected}")
    return obj


def export_glb(obj: bpy.types.Object, path: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = dict(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=False,
        export_materials="NONE",
    )
    # The vertex-colour switch was renamed in Blender 4.2.
    if "export_vertex_color" in props:
        kw["export_vertex_color"] = "ACTIVE"
    elif "export_colors" in props:
        kw["export_colors"] = True
    for k in ("export_animations", "export_skins", "export_morph", "export_cameras", "export_lights"):
        if k in props:
            kw[k] = False
    bpy.ops.export_scene.gltf(**kw)


def render_previews(objs: dict[str, bpy.types.Object], folder: Path) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "VERTEX"
    shading.show_shadows = True
    shading.show_cavity = False
    scene.render.resolution_x = 900
    scene.render.resolution_y = 600
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("bg")
    world.color = (0.9, 0.88, 0.82)
    scene.world = world

    # Ground: the woodland colour, as under the trees in the viewer.
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    ground = bpy.context.active_object
    gm = ground.data
    col = gm.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    from yelamu.plants import hex_to_linear

    g = hex_to_linear(0x4F6B3F)
    for d in col.data:
        d.color = (*g, 1.0)
    gm.color_attributes.active_color = col

    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def shoot(path: Path, scale: float, target: Vector) -> None:
        # Seen from about 35 degrees up, like the viewer's map camera when zoomed in.
        el = math.radians(35)
        az = math.radians(-45)
        d = 10
        cam.location = target + Vector((d * math.cos(el) * math.sin(-az), -d * math.cos(el) * math.cos(az), d * math.sin(el)))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam_data.ortho_scale = scale
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)

    # Each tree alone, then all three side by side at typical heights (metres).
    for sp, obj in objs.items():
        for other in objs.values():
            other.hide_render = other is not obj
            other.location = (0, 0, 0)
            other.scale = (1, 1, 1)
        shoot(folder / f"{sp}.png", 2.2, Vector((0, 0, 0.45)))
    heights = {"oak": 9.0, "bay": 10.0, "willow": 6.0}
    # Along the camera's right-hand direction, so they stand side by side, not behind each other.
    right = Vector((math.cos(math.radians(45)), math.sin(math.radians(45)), 0))
    for k, (sp, obj) in enumerate(objs.items()):
        obj.hide_render = False
        obj.scale = (heights[sp],) * 3
        obj.location = right * ((k - 1) * 13.0)
    shoot(folder / "lineup.png", 40, Vector((0, 0, 3.5)))


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--preview", type=Path)
    ap.add_argument("--detailed", action="store_true", help="build the detailed set (DETAILED_RECIPES)")
    args = ap.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    recipes = DETAILED_RECIPES if args.detailed else RECIPES
    objs = {sp: build(sp, recipes) for sp in SPECIES}
    for sp, obj in objs.items():
        export_glb(obj, args.out / f"{sp}.glb")
        print(f"{sp}: {len(obj.data.polygons)} triangles -> {args.out / f'{sp}.glb'}")
    if args.preview:
        args.preview.mkdir(parents=True, exist_ok=True)
        render_previews(objs, args.preview)
        print(f"previews in {args.preview}")


main()
