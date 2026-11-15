/*
 * Turns decoded FIT distance/altitude samples into Athlima's course shape.
 * Distances and elevations are metres; slopes are percent rise over horizontal
 * distance. Missing elevations reuse the preceding elevation, and a simplified
 * point list supports the course graph alongside the original detail.
 */

import { exists, equals, first, toFixed, } from '../functions.js';
import { FITjs } from './fitjs.js';
import { g } from '../views/graph.js';

// Simplify the elevation line, recalculate each segment's length/grade, and attach course metadata.
function toCourse(points, distance, name, description) {
    const pointsSimplified = g.simplify(points, 0.5, true).map((p, i, xs) => {
        const x1 = xs[i].x;
        const y1 = xs[i].y;
        const x2 = (xs[i+1]?.x ?? xs[i].x);
        const y2 = (xs[i+1]?.y ?? xs[i].y);
        const run = x2 - x1;
        const rise = y2 - y1;
        const r = Math.sqrt(run**2 + rise**2);
        const slope = equals(run, 0) ? 0 : (100 * (rise/run));
        xs[i].r = r;
        xs[i].slope = slope;
        return xs[i];
    });

    return {
        meta: {
            name: name ?? 'Course',
            author: 'n/a',
            category: 'Course',
            description: description,
            distance,
        },
        // id: 0,
        points,
        pointsSimplified,
    };
}

// These predicates select ordinary ride samples and the distance/elevation values needed for a course.
function isDataRecord(x) {
    return equals(x.type, 'data') && equals(x.name, 'record');
}

function hasAltitude(x) {
    return exists(x.fields.altitude);
}

function hasDistance(x) {
    return exists(x.fields.distance);
}

// Match the course-message shape used by the name lookup below.
function isCourseDataMessage(x) {
    return equals(x.type, 'data') && equals(x.message, 'course');
}

// Prefer a course-message name, otherwise tidy the filename by dropping .fit and separator characters.
function courseName(course, fileName) {
    const courseDataMessage = course.find(isCourseDataMessage);
    const name = courseDataMessage?.fields?.name ?? fileName;
    return name.replace(/.fit/gi, '').replace(/_|-/gi, ' ');
}

// Decode the file, fill elevation gaps and derive horizontal distance from travelled distance.
// At least one distance sample with altitude is required to seed the elevation history.
function decode(view, fileName) {
    const courseJS = FITjs.decode(view);
    console.log(courseJS);

    const name = courseName(courseJS, fileName);
    const author = `n/a`;
    const description = ``;

    let distanceTotal = 0;
    let x = 0;

    const dataRecords = courseJS.filter(r => isDataRecord(r) && hasDistance(r));
    const altitudeRecords = dataRecords.filter(hasAltitude);

    let prevAltitude = first(altitudeRecords).fields.altitude;

    const points = dataRecords.reduce((acc, m, i, xs) => {
        if(!exists(m.fields.altitude)) {
            m.fields.altitude = prevAltitude;
            console.log(prevAltitude);
        } else {
            prevAltitude = m.fields.altitude;
        }

        const altitude     = m.fields.altitude;
        const altitudeNext = xs[i+1]?.fields?.altitude ?? m.fields.altitude;

        const distance = m.fields.distance;
        const distanceNext = xs[i+1]?.fields?.distance ?? m.fields.distance;

        const rise  = altitudeNext - altitude;
        const r     = distanceNext - distance;
        const run   = equals(r, 0) ? 0 : Math.sqrt(Math.abs(r**2 - rise**2));
        const slope = equals(run, 0) ? 0 : 100 * (rise/run);

        acc.push({
            x,
            y: altitude,
            r,
            slope,
            distance,
            position_lat: m.fields.position_lat,
            position_long: m.fields.position_long,
        });
        x += run;
        distanceTotal = distance;
        return acc;
    }, []);

    return toCourse(points, distanceTotal, name, description);
}

const localCourse = {
    decode,
};

export {
    localCourse,
};
