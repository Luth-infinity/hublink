#!/bin/sh
# Transforme une capture vidéo en GIF léger pour la fenêtre « Nouveautés ».
# Usage : scripts/gif.sh capture.mov nouveaute.gif [début en s] [durée en s]
#
# 640 px de large, 12 images/s, 8 s au plus, palette calculée sur la vidéo
# elle-même : vise moins de 2 Mo. Au-delà, raccourcir plutôt que réduire la
# taille, un GIF plus petit que la modale devient illisible.
set -e
[ -n "$2" ] || { echo "Usage : $0 entree.mov sortie.gif [debut] [duree]"; exit 1; }
filtre="fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle"
ffmpeg -v error -y -ss "${3:-0}" -t "${4:-8}" -i "$1" -filter_complex "$filtre" -loop 0 "$2"
echo "$2 : $(du -h "$2" | cut -f1)"
