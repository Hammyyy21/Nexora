/* Smart Cooling Controller — demonstration logic, ARM Cortex-M3.
 * sensor_sample and fan_duty point to RAM supplied by a test harness.
 * They are NOT peripheral addresses. A board port must supply startup,
 * clocks, calibrated sensor/I2C drivers, GPIO/PWM, and pin configuration.
 * This object contains no main(), vector table, or flashable image.
 */
#define TEMP_THRESHOLD_C 30
#define FAN_FULL_DUTY 100u

/* U3 is read by U1; the sensor does not execute this firmware.
 * Demonstration adapter: read an already-decoded Celsius RAM sample.
 */
int sensor_read_celsius(volatile const int *sensor_sample) {
    return *sensor_sample;
}

/* U1 controls Q1, which switches FAN1. This RAM output represents a
 * requested PWM duty percentage, NOT a hardware PWM driver.
 */
void fan_set_duty(volatile unsigned int *fan_duty, unsigned int duty) {
    *fan_duty = duty;
}

void update_fan(volatile const int *sensor_sample,
                volatile unsigned int *fan_duty) {
    int temperature = sensor_read_celsius(sensor_sample);
    if (temperature > TEMP_THRESHOLD_C) {
        fan_set_duty(fan_duty, FAN_FULL_DUTY);
    } else {
        fan_set_duty(fan_duty, 0u);
    }
}
