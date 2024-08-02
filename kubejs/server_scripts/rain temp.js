// Import necessary classes
const TICK_INTERVAL = 20; // Check every second (20 ticks)
const TARGET_TEMP = 60; // Target temperature in Fahrenheit
const HOT_TEMP = 90; // Temperature threshold in Fahrenheit

// Function to convert Fahrenheit to Celsius
function fahrenheitToCelsius(f) {
    return (f - 32) * 5 / 9;
}

// Function to convert Celsius to Fahrenheit
function celsiusToFahrenheit(c) {
    return (c * 9 / 5) + 32;
}

onEvent('server.tick', event => {
    let world = event.server.getWorld('minecraft:overworld');
    let currentTempF = celsiusToFahrenheit(world.temperature);
    
    if (currentTempF > HOT_TEMP) {
        // Start raining
        world.setWeather(0, 6000, true, false);
        world.schedule(() => {
            let interval = setInterval(() => {
                currentTempF = celsiusToFahrenheit(world.temperature);
                
                if (currentTempF <= TARGET_TEMP) {
                    // Stop rain and set temperature to target
                    world.setWeather(0, 0, false, false);
                    world.temperature = fahrenheitToCelsius(TARGET_TEMP);
                    clearInterval(interval);
                } else {
                    // Gradually decrease the temperature
                    world.temperature -= 0.1; // Decrease temperature gradually
                }
            }, TICK_INTERVAL);
        }, TICK_INTERVAL);
    }
});
