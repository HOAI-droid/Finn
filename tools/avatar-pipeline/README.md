# Avatar-Pipeline

Baut aus `source/meshy_fennec_all_animations.glb` den Avatar `web/fennec_avatar.glb` (Gesicht aus Textur entfernt, Overlay-Augen/Brauen/Mund, Ohrknochen).
Reihenfolge: `extract.py` → `dump.py` → `planar2.py` → `clean2.py` → `measure.py` → `bakeback.py` → `build_atlas.py` → `build_avatar.py` (letzteres in Blender/`bpy`: `python build_avatar.py <quelle.glb> <ziel.glb>`).
Die Skripte nutzen noch den festen Arbeitsordner `/home/claude/work/` (Variable `WD`) – vor Gebrauch anpassen. Voraussetzungen: `bpy`, `trimesh`, `numpy`, `scipy`, `Pillow`, `opencv-python`.
Die fertigen Atlanten (`*_atlas.png`, `eyes_mr.png`, `texture_clean.png`) liegen zur Referenz hier. Der Avatar im Repo ist das Ergebnis; die Pipeline ist nur nötig, wenn das Modell ersetzt wird.
