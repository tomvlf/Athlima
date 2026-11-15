/**
 * Follows an imported route as simulated ride distance advances. Detailed points provide map
 * position; simplified segments provide road slope for the trainer. It listens to the app message
 * bus and switches route rides to slope-simulation mode. This is route playback, not live GPS
 * tracking.
 */

import { xf, equals, exists, first, } from './functions.js';
import { models } from './models/models.js';
import { Status, ControlMode, } from './ble/enums.js';

/**
 * Set up one route follower with current distance, map-point and segment positions, then subscribe
 * to workout and ride events.
 */
function Course() {

    const abortController = new AbortController();
    const signal = {signal: abortController.signal};

    xf.sub(`db:distance`,     onDistance.bind(this), signal);
    xf.sub('db:workout',      onWorkout.bind(this), signal);
    xf.sub('ui:workoutStart', onWatchStart.bind(this), signal);
    xf.sub('ui:watchStart',   onWatchStart.bind(this), signal);
    xf.sub('db:courseIndex',  onCourseIndex.bind(this), signal);

    let started = false;
    let distance = 0;
    let index = 0;
    let maxIndex = 0;
    let maxPointIndex = 0;
    let courseDistance = 0;
    let r = 0;
    let slope = 0;
    let course;
    let pointIndex = 0;

    let segmentStart = 0;
    let segment = {};

    function isCourse() {
        return exists(course?.points);
    }
    function restore() {
    }
    function onCourseIndex(courseIndex) {
        console.log(`:course :index ${courseIndex}`);
        index = courseIndex;
    }
    /**
     * While route playback is active, choose a nearby course point, wrap distance around the route
     * and send a new trainer slope when the current segment ends.
     */
    function onDistance(value) {
        if(!started) return;

        while((pointIndex % maxPointIndex) < course.points.length) {
            if((value % courseDistance) > course.points[pointIndex].distance) {
                // console.log(`< ${pointIndex}/${value} : ${pointIndex} ${course.points[pointIndex].distance}`);
                pointIndex += 1;
            } else {
                var p0 = course.points[pointIndex-1]?.distance ?? 0;
                var p1 = course.points[pointIndex].distance;

                var p0d = Math.abs(p0 - value);
                var p1d = Math.abs(p1 - value);

                // console.log(`>= ${pointIndex}/${value} : ${p0} ~${p0d}, ${p1} ~${p1d}`);

                if(p0d < p1d) {
                    xf.dispatch('course:position', {
                        position_lat: course.points[pointIndex-1].position_lat,
                        position_long: course.points[pointIndex-1].position_long,
                    });
                    pointIndex = Math.max(pointIndex - 1, 0);
                } else {
                    xf.dispatch('course:position', {
                        position_lat: course.points[pointIndex].position_lat,
                        position_long: course.points[pointIndex].position_long,
                    });
                }

                break;
            }
        }


        distance = (parseFloat(value) % courseDistance);

        if((distance - segmentStart) >= r || (segmentStart > distance)) {
            const indexNext = (index + 1) % maxIndex;
            xf.dispatch('course:index', indexNext);

            setSegment(indexNext);

            xf.dispatch(`ui:slope-target-set`, slope);
        }
    }
    /**
     * Use a selected workout as a route only when it has course points, then initialize segment
     * bounds and starting altitude.
     */
    function onWorkout(workout) {
        course = workout;

        if(exists(course?.points)) {
            console.log(first(course.points).y);

            setCourse(course);
            setSegment(index);

            xf.dispatch('altitude', first(course.points).y);
        }
    }
    /**
     * Start route playback alongside the ride clock only when the selected workout actually
     * contains route points.
     */
    function onWatchStart() {
        if(isCourse()) {
            start();
        }
    }
    /**
     * Initialize a route at its starting distance and announce slope-simulation mode plus the
     * current slope.
     */
    function start() {
        if(distance > 0) return;
        started = true;

        // setWorkout
        setCourse(course);
        setSegment(index);
        // r = indexToR(index);
        // slope = indexToSlope(index);

        xf.dispatch(`ui:slope-target-set`, slope);
        xf.dispatch(`ui:mode-set`, ControlMode.sim);
        console.log(`start a course ...`);
    }
    /** Cache the route's point/segment bounds and total distance for subsequent distance updates. */
    function setCourse(course) {
        maxIndex = course.pointsSimplified.length-1;
        maxPointIndex = course.points.length-1;
        courseDistance = course.meta.distance;
    }
    /** Load a simplified segment's distance span, slope and starting position for trainer control. */
    function setSegment(index) {
        segment = indexToSegment(index);
        r = segment.r;
        slope = segment.slope;
        segmentStart = segment.distance ?? distance;
    }
    /**
     * The segment lookup helpers read the simplified route rather than recomputing slopes from
     * every detailed map point.
     */
    function indexToSlope(index) {
        return course.pointsSimplified[index].slope;
    }
    function indexToR(index) {
        return course.pointsSimplified[index].r;
    }
    function indexToSegment(index) {
        return course.pointsSimplified[index];
    }

    Object.freeze({
        start,
    });
}

// r = 12;
// slope = -0.4819;
// distance = 7429;

//  0: -1.2,    453, 0,
//  1: -0.4, 	   94, 454,
//  2:  1.2,    104, 548,
//  3:  0.447, 1072, 652,
//  4:  0.133,  299, 1724,
//  5:  0.9,    564, 2023,
//  6:  0.57,  1087, 2587,
//  7:  0.0,    823, 3674,
//  8: -0.7, 	  680, 4497,
//  9: -0.46,	  649, 5177,
// 10: -0.15,   390, 5826,
// 11:  0.0,   1213, 6216,
// 12: -0.4,     83, 7413,
// 13: -3.9,     56, 7512,
// 14: -1.0, 	  220, 7568,
// 15:  0,        0, 7788,

// 1:10, 0.4, 3, ~800

const course = Course();

export { course };
