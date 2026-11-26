/**
 * Checks ZWO XML parsing into descriptive elements and playable intervals, including work/recovery
 * cadence and timed text instructions. Embedded XML strings are intentionally readable input
 * examples; expected objects show exactly how their names, seconds, power fractions and messages
 * should be translated.
 */

/**
 * @jest-environment jsdom
 */

import { zwo } from '../../src/workouts/zwo.js';
import { repeat } from '../../src/functions.js';
import { workouts } from '../../src/workouts/workouts.js';

import { JSDOM } from 'jsdom';

const parser = new DOMParser();

const removeWhiteSpace = (str) => str.replace(/\s/g,'');

describe('Zwo', () => {

    test('built-in cadence sessions retain work and recovery targets in playback intervals', () => {
        const source = workouts.find(workout => workout.includes('<name>Cadence Foundations 30</name>'));
        const workout = zwo.readToInterval(source);
        expect(workout.meta.duration).toBe(1800);
        expect(workout.intervals.flatMap(interval => interval.steps)
            .filter(step => step.cadence != null).map(step => step.cadence))
            .toEqual([95, 80, 95, 80, 95, 80, 95, 80]);
    });
    test('Zwo.read without textevents', () => {
        const input = `
        <workout_file>
            <author>Too Many Watts</author>
            <name>Test Workout</name>
            <category>Sweet Spot</category>
            <subcategory></subcategory>
            <description>Description of test workout</description>
            <sporttype>bike</sporttype>
            <tags></tags>
            <workout>
                <SteadyState Duration="10" Power="0.50"/>
                <SteadyState Duration="15" Power="0.90"/>
                <SteadyState Duration="10" Power="0.70" Slope="2.1" Cadence="90"/>
                <SteadyState Duration="15" Power="0.92" Cadence="80"/>
                <IntervalsT Repeat="2" OnDuration="40" OffDuration="20" OnPower="1.21" OffPower="0.7" OnSlope="4.8" OffSlope="0" />
                <SteadyState Duration="10" Cadence="90"/>
            </workout>
        </workout_file>`;

        const expected = {
            head: {
                author: 'Too Many Watts',
                name: "Test Workout",
                category: "Sweet Spot",
                subcategory: "",
                sportType: "bike",
                description: "Description of test workout",
                tags: "",
            },
            body: [
                {element: 'SteadyState', Duration: 10, Power: 0.50},
                {element: 'SteadyState', Duration: 15, Power: 0.90,},
                {element: 'SteadyState', Duration: 10, Power: 0.70, Slope: 2.1, Cadence: 90},
                {element: 'SteadyState', Duration: 15, Power: 0.92, Cadence: 80},
                {element: 'IntervalsT',  Repeat: 2, OnDuration: 40, OffDuration: 20, OnPower: 1.21, OffPower: 0.7, OnSlope: 4.8, OffSlope: 0},
                {element: 'SteadyState', Duration: 10, Cadence: 90},
            ],
        };

        let res = zwo.read(input);

        expect(res).toStrictEqual(expected);
    });

    test('Zwo.read with textevents', () => {
        const input = `
            <workout_file>
                <author>Too Many Watts</author>
                <name>Test Workout</name>
                <category>Sweet Spot</category>
                <subcategory></subcategory>
                <description>Description of test workout</description>
                <sporttype>bike</sporttype>
                <tags></tags>
                <workout>
                    <SteadyState Duration="10" Power="0.50">
                        <textevent timeoffset="0" message="01 SteadyState 01 message +00 10s" duration="10" />
                    </SteadyState>
                    <SteadyState Duration="20" Power="0.90">
                        <textevent timeoffset="0" message="02 SteadyState 01 message +00 10s" duration="10" />
                        <textevent timeoffset="10" message="02 SteadyState 02 message +10 10s" duration="10" />
                    </SteadyState>
                    <SteadyState Duration="60" Power="0.50">
                        <textevent timeoffset="10" message="03 SteadyState 01 message +10 10s" duration="10" />
                        <textevent timeoffset="30" message="03 SteadyState 02 message +30 10s" duration="10" />
                        <textevent timeoffset="50" message="03 SteadyState 03 message +50 10s" duration="10" />
                    </SteadyState>
                    <FreeRide Duration="10">
                        <textevent timeoffset="0" message="04 FreeRide 01 message +00 10s" duration="10" />
                    </FreeRide>
                    <IntervalsT Repeat="2" OnDuration="10" OffDuration="5" OnPower="1.21" OffPower="0.7">
                        <textevent timeoffset="0" message="05 IntervalsT 01 interval 01 message +00 10s" duration="10" />
                        <textevent timeoffset="10" message="05 IntervalsT 02 interval 01 message +00 05s" duration="5" />
                        <textevent timeoffset="15" message="05 IntervalsT 03 interval 01 message +00 10s" duration="10" />
                        <textevent timeoffset="25" message="05 IntervalsT 04 interval 01 message +00 05s" duration="5" />
                    </IntervalsT>
                </workout>
            </workout_file>`;

        const expected = {
            head: {
                author: 'Too Many Watts',
                name: "Test Workout",
                category: "Sweet Spot",
                subcategory: "",
                sportType: "bike",
                description: "Description of test workout",
                tags: "",
            },
            body: [
                {element: 'SteadyState', Duration: 10, Power: 0.50, children: [
                    {element: 'TextEvent', duration: 10, timeoffset: 0, message: "01 SteadyState 01 message +00 10s"}
                    ]
                },
                {element: 'SteadyState', Duration: 20, Power: 0.90, children: [
                    {element: 'TextEvent', duration: 10, timeoffset: 0, message: "02 SteadyState 01 message +00 10s"},
                    {element: 'TextEvent', duration: 10, timeoffset: 10, message: "02 SteadyState 02 message +10 10s"}
                ]
                },
                {element: 'SteadyState', Duration: 60, Power: 0.50, children: [
                    {element: 'TextEvent', duration: 10, timeoffset: 10, message: "03 SteadyState 01 message +10 10s"},
                    {element: 'TextEvent', duration: 10, timeoffset: 30, message: "03 SteadyState 02 message +30 10s"},
                    {element: 'TextEvent', duration: 10, timeoffset: 50, message: "03 SteadyState 03 message +50 10s"}
                    ]
                },
                {element: 'FreeRide', Duration: 10, children: [
                    {element: 'TextEvent', duration: 10, timeoffset: 0, message: "04 FreeRide 01 message +00 10s"}
                    ]
                },
                {element: 'IntervalsT', Repeat: 2, OnDuration: 10, OffDuration: 5, OnPower: 1.21, OffPower: 0.7, children: [
                    {element: 'TextEvent', duration: 10, timeoffset: 0, message: "05 IntervalsT 01 interval 01 message +00 10s"},
                    {element: 'TextEvent', duration: 5, timeoffset: 10, message: "05 IntervalsT 02 interval 01 message +00 05s"},
                    {element: 'TextEvent', duration: 10, timeoffset: 15, message: "05 IntervalsT 03 interval 01 message +00 10s"},
                    {element: 'TextEvent', duration: 5, timeoffset: 25, message: "05 IntervalsT 04 interval 01 message +00 05s"}
                    ]
                }
            ],
        };

        let res = zwo.read(input);

        expect(res).toStrictEqual(expected);
    });

    test('Zwo.readToInterval without textevents', () => {
        const input = `
        <workout_file>
            <author>Too Many Watts</author>
            <name>Test Workout</name>
            <category>Sweet Spot</category>
            <subcategory></subcategory>
            <description>Description of test workout</description>
            <sporttype>bike</sporttype>
            <tags></tags>
            <workout>
                <SteadyState Duration="10" Power="0.50"/>
                <SteadyState Duration="15" Power="0.90"/>
                <SteadyState Duration="10" Power="0.70" Slope="2.1" Cadence="90"/>
                <SteadyState Duration="15" Power="0.92" Cadence="80"/>
                <IntervalsT Repeat="2" OnDuration="40" OffDuration="20" OnPower="1.21" OffPower="0.7" OnSlope="4.8" OffSlope="0" />
                <SteadyState Duration="10" Cadence="90"/>
            </workout>
        </workout_file>`;

        const expected = {
            // id: "{1ec20f99-b3d8-4eb9-c000-be96e947897a}",
            meta: {
                author: 'Too Many Watts',
                name: "Test Workout",
                category: "Sweet Spot",
                subcategory: "",
                sportType: "bike",
                description: "Description of test workout",
                tags:"",
                duration: 3 * 60, // 60s
            },
            intervals: [
                {duration: 10, steps: [{duration: 10, power: 0.50}]},
                {duration: 15, steps: [{duration: 15, power: 0.90}]},
                {duration: 10, steps: [
                    {duration: 10, power: 0.70, slope: 2.1, cadence: 90}]},
                {duration: 15, steps: [{duration: 15, power: 0.92, cadence: 80}]},
                {duration: 40, steps: [{duration: 40, power: 1.21, slope: 4.8}]},
                {duration: 20, steps: [{duration: 20, power: 0.7, slope: 0.0}]},
                {duration: 40, steps: [{duration: 40, power: 1.21, slope: 4.8}]},
                {duration: 20, steps: [{duration: 20, power: 0.7, slope: 0.0}]},
                {duration: 10, steps: [{duration: 10, power: 0, slope: 0, cadence: 90}]},
            ],
        };

        let res = zwo.readToInterval(input);

        expect(res).toStrictEqual(expected);
    });

    test('Zwo.readToInterval with text events', () => {
        const input = `
            <workout_file>
                <author>Too Many Watts</author>
                <name>Test Workout</name>
                <category>Sweet Spot</category>
                <subcategory></subcategory>
                <description>Description of test workout</description>
                <sporttype>bike</sporttype>
                <tags></tags>
                <workout>
                    <SteadyState Duration="10" Power="0.50">
                        <textevent timeoffset="0" message="01 SteadyState 01 message +00 10s" duration="10" />
                    </SteadyState>
                    <SteadyState Duration="20" Power="0.90">
                        <textevent timeoffset="0" message="02 SteadyState 01 message +00 10s" duration="10" />
                        <textevent timeoffset="10" message="02 SteadyState 02 message +10 10s" duration="10" />
                    </SteadyState>
                    <SteadyState Duration="60" Power="0.50">
                        <textevent timeoffset="10" message="03 SteadyState 01 message +10 10s" duration="10" />
                        <textevent timeoffset="30" message="03 SteadyState 02 message +30 10s" duration="10" />
                        <textevent timeoffset="50" message="03 SteadyState 03 message +50 10s" duration="10" />
                    </SteadyState>
                    <FreeRide Duration="10">
                        <textevent timeoffset="0" message="04 FreeRide 01 message +00 10s" duration="10" />
                    </FreeRide>
                    <IntervalsT Repeat="2" OnDuration="10" OffDuration="5" OnPower="1.21" OffPower="0.7">
                        <textevent timeoffset="0" message="05 IntervalsT 01 interval 01 message +00 10s" duration="10" />
                        <textevent timeoffset="10" message="05 IntervalsT 02 interval 01 message +00 05s" duration="5" />
                        <textevent timeoffset="15" message="05 IntervalsT 03 interval 01 message +00 10s" duration="10" />
                        <textevent timeoffset="25" message="05 IntervalsT 04 interval 01 message +00 05s" duration="5" />
                    </IntervalsT>
                </workout>
            </workout_file>`;

        const expected = {
            // id: "{1ec20f99-b3d8-4eb9-c000-be96e947897a}",
            meta: {
                author: 'Too Many Watts',
                name: "Test Workout",
                category: "Sweet Spot",
                subcategory: "",
                sportType: "bike",
                description: "Description of test workout",
                tags: "",
                duration: 10+20+60+10+10+5+10+5, // 130s 00:02:10
            },
            intervals: [
                {duration: 10, steps: [{duration: 10, power: 0.50, messages: [
                    {duration: 10, offset: 0, message: "01 SteadyState 01 message +00 10s"},
                ]}]},
                {duration: 20, steps: [{duration: 20, power: 0.90, messages: [
                    {duration: 10, offset: 0, message: "02 SteadyState 01 message +00 10s"},
                    {duration: 10, offset: 10, message: "02 SteadyState 02 message +10 10s"},
                ]}]},
                {duration: 60, steps: [{duration: 60, power: 0.50, messages: [
                    {duration: 10, offset: 10, message: "03 SteadyState 01 message +10 10s"},
                    {duration: 10, offset: 30, message: "03 SteadyState 02 message +30 10s"},
                    {duration: 10, offset: 50, message: "03 SteadyState 03 message +50 10s"},
                ]}]},
                {duration: 10, steps: [{duration: 10, power: 0, slope: 0, messages: [
                    {duration: 10, offset: 0, message: "04 FreeRide 01 message +00 10s"},
                ]}]},
                {duration: 10, steps: [{duration: 10, power: 1.21, messages: [
                    {duration: 10, offset: 0, message: "05 IntervalsT 01 interval 01 message +00 10s"},
                ]}]},
                {duration: 5, steps: [{duration: 5, power: 0.70, messages: [
                    {duration: 5, offset: 0, message: "05 IntervalsT 02 interval 01 message +00 05s"},
                ]}]},
                {duration: 10, steps: [{duration: 10, power: 1.21, messages: [
                    {duration: 10, offset: 0, message: "05 IntervalsT 03 interval 01 message +00 10s"},
                ]}]},
                {duration: 5, steps: [{duration: 5, power: 0.70, messages: [
                    {duration: 5, offset: 0, message: "05 IntervalsT 04 interval 01 message +00 05s"},
                ]}]},
            ],
        };

        let res = zwo.readToInterval(input);

        expect(res).toStrictEqual(expected);
    });

    test('export escapes metadata and attributes instead of injecting XML', () => {
        const source = {
            meta: {
                author: 'A & B', name: 'Bad </name><script>alert(1)</script>',
                category: 'Test', subcategory: '', description: '5 > 4 & "quoted"',
                sportType: 'bike', tags: '',
            },
            intervals: [{duration: 60, steps: [{duration: 60, power: 0.5, cadence: 90}]}],
        };
        const xml = zwo.write(zwo.fromInterval(source));
        expect(xml).not.toContain('</name><script>');
        expect(xml).toContain('&lt;/name&gt;&lt;script&gt;');
        expect(xml).toContain('5 &gt; 4 &amp; &quot;quoted&quot;');
    });

    test('rejects malformed XML before reading workout children', () => {
        expect(() => zwo.readToInterval('<workout_file><name>broken</workout_file>'))
            .toThrow(/not valid ZWO XML/);
        expect(() => zwo.read('<workout_file><name>broken</workout_file>'))
            .toThrow(/not valid ZWO XML/);
    });

    test('a file without a workout element produces no intervals', () => {
        expect(zwo.readToInterval('<workout_file><name>Empty</name></workout_file>').intervals).toEqual([]);
    });

    test('clamps absurd durations and repeats instead of freezing the tab', () => {
        const warmup = zwo.readToInterval(`<workout_file><name>Huge</name><workout>
            <Warmup Duration="10000000000" PowerLow="0.5" PowerHigh="0.7"/>
        </workout></workout_file>`);
        expect(warmup.intervals[0].steps.length).toBeLessThanOrEqual(8640);

        const repeats = zwo.readToInterval(`<workout_file><name>Huge</name><workout>
            <IntervalsT Repeat="999999" OnDuration="60" OffDuration="60" OnPower="1" OffPower="0.5"/>
        </workout></workout_file>`);
        expect(repeats.intervals.length).toBeLessThanOrEqual(2000);
    });
});
