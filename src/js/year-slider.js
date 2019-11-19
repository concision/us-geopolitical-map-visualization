window.addEventListener("load", () => {
    window.slider = new Slider(document.getElementById("slider-year"));
    slider.initialize();
});

class Slider {
    constructor(element) {
        this.element = element;
    }

    initialize() {
        this.render()
    }

    render() {
        // time range
        const tickYears = d3.range(1976, 2018 + .1, 2)
            .map(year => new Date(year, 1, 1));

        // define slider
        const sliderTime = d3
            .sliderBottom()
            // view
            .width(700)
            // range
            .min(d3.min(tickYears))
            .max(d3.max(tickYears))
            .step(1000 * 60 * 60 * 24 * 365 * 2)
            // ticks
            .tickFormat(d3.timeFormat('%Y'))
            .tickValues(tickYears)
            // default
            .default(new Date(2018, 1, 1))
            // on change
            .on('onchange', date => this.select(date.getFullYear()));

        // create slider element
        d3.select(this.element)
            .append('svg')
            .attr('width', 765)
            .attr('height', 100)
            .append('g')
            .attr('transform', 'translate(30,30)')
            .call(sliderTime);
    }

    select(year) {
        if ("queuedUpdate" in this) {
            clearTimeout(this.queuedUpdate);
        }

        this.queuedUpdate = setTimeout(() => {
            d3.select('#map-title').text(`${year} Congressional Election Results by District`);
            map.showDistrict(year);
        }, 250);
    }
}
