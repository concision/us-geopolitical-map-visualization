// initialize rnederer
window.addEventListener("load", () => {
    window.map = new Renderer(document.getElementById("map"));
    map.initialize()
});

Number.prototype.clamp = function(min, max) {
    return Math.min(Math.max(this, min), max);
};

class Renderer {
    /**
     * Imported topojson map data
     * @type {{us: {}, districts: {}}}
     */
    maps = {};
    /**
     * Currently rendered district year
     * @type {string}
     */
    currentYear;

    /**
     * Construct a new map renderer
     * @param svgElement SVG element to bind onto
     */
    constructor(svgElement) {
        this.svg = d3.select(svgElement);
    }

    // state

    /**
     * Initialize map SVG renderer
     */
    initialize() {
        this.buildSvg();
        this.importData(data => {
            this.processImports(data);
            this.drawBorders(() => {
                this.showDistrict(2018);
            });
        });
    }

    /**
     * Executed in the event a JavaScript error occurs
     */
    error(exception) {
        alert("Failed");
        console.error(exception);
    }

    // data importation

    /**
     * Imports political data from "data/"
     * @param callback data callback
     */
    importData(callback) {
        Promise.all([
            // district mappings
            d3.json("data/year_district_mappings.json").then(json => {
                return {districtYears: json}
            }),
            // US map
            d3.json("data/us_map.json").then(json => {
                return {usMap: json}
            }),
            // US district maps
            d3.json("data/district_map.json").then(json => {
                return {districtMaps: json}
            }),
            // election data
            d3.csv("data/1976-2018-house.csv", function (row) {
                // parse row
                return {
                    year: parseInt(row["year"], 10),
                    state: row["state"],
                    state_po: row["state_po"],
                    district: parseInt(row["district"], 10),
                    candidate: row["candidate"],
                    party: row["party"],
                    votes: {
                        candidate: parseInt(row["candidatevotes"], 10),
                        total: parseInt(row["totalvotes"], 10)
                    }
                };
            }).then(data => {
                return {elections: data}
            })
        ])
        // execute callback
            .then(data => callback(Object.assign({}, ...data)))
            // handle exception
            .catch(error => this.error(error));
    }

    /**
     * Processes imports received from Renderer#importData(callback)
     * @param data mapped imports
     */
    async processImports(data) {
        // import district mappings by year
        this.districtYears = {};
        Object.keys(data.districtYears).forEach(key => {
            this.districtYears[parseInt(key)] = data.districtYears[key];
        });

        // copy maps
        this.maps.us = data.usMap;
        this.maps.districts = data.districtMaps;

        // determine election winners by (year, state, district)
        const victors = {};
        for (const i in data.elections) {
            // candidate
            const candidate = data.elections[i];
            if (!candidate.year) continue;
            // ensure structure exists
            if (!(candidate.year in victors)) victors[candidate.year] = {};
            if (!(candidate.state in victors[candidate.year])) victors[candidate.year][candidate.state] = {};

            // check if a previous victor exists
            if (candidate.district in victors[candidate.year][candidate.state]) {
                // current district victor
                const currentVictor = victors[candidate.year][candidate.state][candidate.district];
                // check if this victor beats previous victor
                if (currentVictor.votes.candidate < candidate.votes.candidate) {
                    // update district victor
                    victors[candidate.year][candidate.state][candidate.district] = candidate;
                }
            } else {
                // set victor
                victors[candidate.year][candidate.state][candidate.district] = candidate;
            }
        }
        // assign victors
        this.victors = victors;


        // determine shading constant
        for (const year of Object.keys(this.victors)) {
            const candidates = Object.keys(this.victors[year])
                .flatMap(state => Object.keys(this.victors[year][state])
                    .map(district => victors[year][state][district])
                )
                .filter(victor => victor.votes);

            const mean = candidates.map(victor => victor.votes.total).reduce((a, b) => a + b, 0) / candidates.length;
            this.victors[year].shading = {
                mean: mean,
                std: Math.sqrt(
                    candidates.map(victor => Math.pow(victor.votes.total - mean, 2))
                        .reduce((a, b) => a + b, 0)
                    / (candidates.length - 1)
                )
            }
        }
    }

    // data

    /**
     * Returns the victor for the given (year, state, district) requested
     * @param year integer year number
     * @param stateCode 2-letter state code
     * @param district integer district code
     * @returns {*}
     */
    victor(year, stateCode, district) {
        if (year in this.victors) {
            if (stateCode in this.victors[year]) {
                if (district in this.victors[year][stateCode]) {
                    return this.victors[year][stateCode][district];
                }
            }
        }
    }


    // drawing

    /**
     * Build basic SVG components
     */
    buildSvg() {
        // select tooltip
        this.tooltip = d3.select('#tooltip');

        // obtain dimensions from HTML tag
        this.width = this.svg.attr("width");
        this.height = this.svg.attr("height");

        // create USA map projection
        this.path = d3.geoPath()
            .projection(d3.geoAlbersUsa()
                .scale(this.width * 1.2)
                .translate([this.width / 2, this.height / 2]));

        // create subgroups (order matters)
        // districts map group
        this.districtsGroup = this.svg.append("g")
            .attr("id", "districts");
        // borders map group
        this.bordersGroup = this.svg.append("g")
            .attr("id", "borders")
            .style("opacity", 0); // fade in

        this.drawSpinner();
    }

    /**
     * Draw loading spinner until data is loaded
     */
    drawSpinner() {
        const config = {width: 960, height: 500, container: "#map", id: "loader"};
        const radius = Math.min(this.width, this.height) * .2;

        const self = this;

        const arc = d3.arc()
            .innerRadius(radius * 0.6)
            .outerRadius(radius * 1.0)
            .startAngle(0);

        const svg = d3.select(config.container)
            .append("svg")
            .attr("id", "map-spinner")
            .attr("width", this.width)
            .attr("height", this.height)
            .append("g")
            .attr("transform", "translate(" + this.width / 2 + "," + this.height / 2 + ")");

        const background = svg.append("path")
            .datum({endAngle: 2 / 3 * Math.PI})
            .style("fill", "#4D4D4D")
            .attr("d", arc)
            .call(spin, 1500);

        function spin(selection, duration) {
            selection.transition()
                .ease(d3.easeLinear)
                .duration(duration)
                .attrTween("transform", () => d3.interpolateString("rotate(0)", "rotate(360)"));

            self.spinnerTask = setTimeout(() => spin(selection, duration), duration);
        }
    }

    /**
     * Remove loading spinner
     */
    removeSpinner() {
        d3.select("#map-spinner").remove();
        clearTimeout(self.spinnerTask);
    }

    /**
     * Draw united state borders; async abuse for special loading
     */
    async drawBorders(callback) {
        // build land borders
        this.landBorders = await this.bordersGroup.append("path")
            .datum(topojson.feature(this.maps.us, this.maps.us.objects.land))
            .attr("d", this.path)
            .attr("class", "land-border");

        // build state borders
        this.stateBorders = await this.bordersGroup.append("g")
            .selectAll("path")
            .data(topojson.feature(this.maps.us, this.maps.us.objects.states).features)
            .enter()
            .append("path")
            .style("stroke", "3px")
            .attr("class", "state-border")
            .attr("d", this.path);

        // transition and begin executing
        this.bordersGroup.transition()
            .duration(1000)
            .ease(d3.easeLinear)
            .style("opacity", 1)
            .on("end", () => callback());
    }

    /**
     * Draws district
     * @param year year to render
     */
    async showDistrict(year) {
        // sanity check
        if (!(year in this.districtYears)) throw `year ${year} has no district mapping`;
        // short circuit if already showing map
        if (this.currentYear === year) return;

        // previous map
        const previousYear = this.currentYear;
        // set current rendered district
        this.currentYear = year;

        // obtain district map
        const districtId = this.districtYears[year];

        // allow referencing renderer
        const self = this;

        // district counts
        const counts = {democrat: 0, republican: 0, other: 0, missing: 0};

        // construct new map
        this.map = await this.districtsGroup.append("g")
            .attr("id", `${districtId}-${year}`)
            .style("opacity", 0)
            .selectAll("path")
            .data(topojson.feature(this.maps.districts, this.maps.districts.objects[districtId]).features)
            .enter()
            .append("path")
            .attr("class", "district-border")
            .attr("d", this.path)
            .style("fill", function (d) {
                // district information
                const code = d.properties["STATENAME"];
                const district = parseInt(d.properties["DISTRICT"], 10);

                const shadingFactor = self.victors[year].shading;

                // retrieve victor
                const victor = self.victor(year, code, district);
                if (victor) {
                    const shading = .6 + .20 * ((victor.votes.total - shadingFactor.mean) / shadingFactor.std).clamp(-2, 2);
                    switch (victor.party) {
                        case "republican":
                            counts.republican++;
                            return `rgba(237, 67, 55, ${shading})`;
                        case "democrat":
                            counts.democrat++;
                            return `rgba(153, 186, 221, ${shading})`;
                        default:
                            counts.other++;
                            return `rgba(136, 136, 136, ${shading})`;
                    }
                } else {
                    counts.missing++;
                    return "black";
                }
            })
            // handle focusing
            .on("mouseover", function (d) {
                // highlight district
                d3.select(this).style("opacity", ".5");

                // mouse position
                const mouse = d3.mouse(self.svg.node()).map(d => parseInt(d));

                // district information
                const code = d.properties["STATENAME"];
                const district = parseInt(d.properties["DISTRICT"], 10);
                const victor = self.victor(year, code, district);

                // check if a victor is defined
                if (victor) {
                    // show tooltip
                    const mapHolder = document.getElementById("map-holder");
                    self.tooltip.classed('hidden', false)
                        .attr('style', `
                            left: ${mouse[0] + mapHolder.offsetLeft + 10}px; 
                            top: ${mouse[1] + mapHolder.offsetTop + 10}px
                        `)
                        .html(`
                            <b>${d.properties["STATENAME"]} ${victor["state_po"]}-${("0" + (parseInt(d.properties["DISTRICT"]) + 1)).slice(-2)}</b><br>
                            ${victor["candidate"]}<br>
                            <i>${victor["party"].split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ")}</i>
                        `);
                }
            })
            // handle unfocus
            .on("mouseout", function (d) {
                // unhighlight district
                d3.select(this).style("opacity", "1");
                // hide tooltip
                self.tooltip.classed('hidden', true);
            });


        // build legend
        // legend
        const legend = {};
        legend[`Democrat (${counts.democrat})`] = "#99BADD";
        legend[`Republican (${counts.republican})`] = "#ED4337";
        legend[`Other (${counts.other})`] = "#888888";
        legend[`Missing (${counts.missing})`] = "black";

        // size constraint
        const size = 20;

        // select the svg area
        const legendSvg = d3.select(`#${districtId}-${year}`);
        legendSvg.selectAll("mydots")
            .data(Object.keys(legend))
            .enter()
            .append("rect")
            .attr("x", this.width - 150)
            .attr("y", (label, i) => self.height - 25 - (Object.keys(legend).length - i + 1) * (size + 5))
            .attr("width", size)
            .attr("height", size)
            .style("fill", label => legend[label]);

        legendSvg.selectAll("mylabels")
            .data(Object.keys(legend))
            .enter()
            .append("text")
            .attr("x", this.width - 125)
            .attr("y", (d, i) => self.height - 10 - (Object.keys(legend).length - i + 1) * (size + 5))
            .style("fill", label => legend[label])
            .text(label => label)
            .attr("text-anchor", "left")
            .style("alignment-baseline", "middle");


        // fades
        // fade in new map
        d3.select(`#${districtId}-${year}`)
            .transition()
            .duration(1000)
            .ease(d3.easeQuadIn)
            .style("opacity", 1);
        // fade out previous map
        d3.select(`#${this.districtYears[previousYear]}-${previousYear}`)
            .transition()
            .duration(1000)
            .ease(d3.easeQuadIn)
            .style("opacity", 0)
            .on("end", () => d3.select(`#${this.districtYears[previousYear]}-${previousYear}`).remove());

        this.removeSpinner()
    }
}
