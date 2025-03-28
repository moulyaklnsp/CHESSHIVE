function applyMediaQueries() {
    let width = window.innerWidth;
    let statsContainer = document.querySelector('.stats');
    if (width <= 768) {
        statsContainer.style.flexDirection = 'column';
        statsContainer.style.alignItems = 'center';
    } else {
        statsContainer.style.flexDirection = 'row';
        statsContainer.style.alignItems = 'stretch';
    }
}

window.addEventListener('resize', applyMediaQueries);
window.addEventListener('DOMContentLoaded', applyMediaQueries);

var ctx = document.getElementById('growthChart').getContext('2d');

// Create gradient for the fill
const gradientFill = ctx.createLinearGradient(0, 0, 0, 400);
gradientFill.addColorStop(0, 'rgba(255, 255, 0, 0.5)'); // Yellow at the top
gradientFill.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Transparent at the bottom

// Ensure ratingHistory has valid data
const rawRatingData = `<%- JSON.stringify(ratingHistory) %>`;
const ratingData = Array.isArray(rawRatingData) && rawRatingData.length === 6 
    ? rawRatingData.map(val => (val && !isNaN(val) ? val : 400))
    : [400, 400, 400, 400, 400, 400];

// Log ratingData to debug
console.log("Raw Rating Data:", `<%- JSON.stringify(ratingHistory) %>`);
console.log("Processed Rating Data:", ratingData);

const minRating = ratingData && ratingData.length > 0 ? Math.min(...ratingData) - 100 : 300;
const maxRating = ratingData && ratingData.length > 0 ? Math.max(...ratingData) + 100 : 500;

// Log min and max ratings to debug
console.log("Min Rating:", minRating, "Max Rating:", maxRating);

var growthChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: `<%- JSON.stringify(chartLabels) %>`,
        datasets: [{
            label: 'Rating Progress',
            data: ratingData,
            borderColor: '#FFFF00', // Bright yellow line
            backgroundColor: gradientFill, // Gradient fill
            borderWidth: 2,
            fill: true,
            tension: 0, // Straight lines (no curve)
            pointBackgroundColor: '#FFFF00', // Yellow points
            pointBorderColor: '#000000', // Black border around points
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: false,
                min: minRating,
                max: maxRating,
                ticks: {
                    color: '#FFFFFF', // White labels
                    stepSize: 100, // Match the step size in the image
                    font: {
                        size: 12
                    }
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.2)', // Light white grid lines
                    borderColor: 'rgba(255, 255, 255, 0.5)', // White border
                    borderWidth: 1
                }
            },
            x: {
                ticks: {
                    color: '#FFFFFF', // White labels
                    font: {
                        size: 12
                    }
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.2)', // Light white grid lines
                    borderColor: 'rgba(255, 255, 255, 0.5)', // White border
                    borderWidth: 1
                }
            }
        },
        plugins: {
            legend: {
                labels: {
                    color: '#FFFFFF', // White legend text
                    font: {
                        size: 14
                    },
                    boxWidth: 20,
                    boxHeight: 10,
                    padding: 10
                }
            }
        },
        layout: {
            padding: {
                top: 10,
                bottom: 10,
                left: 10,
                right: 10
            }
        }
    }
});