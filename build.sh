#!/usr/bin/env bash
# assumes relevant maps are in "maps/" directory
# requires 'ogr2ogr' dependency

trap 'echo && echo Aborted && exit 1' INT

mkdir -p dist/geojson dist/topojson

for file in maps/*.zip; do
    # base name
    name=${file##*/}; name=${name%.zip}

    echo "[MAP] ${name} (${file})"

    # unpack maps
    if [[ ! -d "dist/unpacked/${name}" ]]; then
        echo "Unpacking ${file}"
        mkdir -p "dist/unpacked/${name}"
        unzip -n "${file}" -d "dist/unpacked/${name}"
    fi

    # convert maps
    if [[ ! -f "dist/geojson/${name}.geojson" ]]; then
        echo "Converting file to GEOJSON"
        ogr2ogr -f GeoJSON -t_srs crs:84 "dist/geojson/${name}.geojson" "dist/unpacked/${name}/districtShapes" > /dev/null 2>&1
    fi
done

# compile files into single map
FILES=""
for file in dist/geojson/*.geojson; do
    # base name
    name=${file##*/}; name=${name%.geojson}

    FILES="\"${name}=dist/geojson/${name}.geojson\" ${FILES}"
done

eval "geo2topo --out out.json -q 4000 $FILES"
