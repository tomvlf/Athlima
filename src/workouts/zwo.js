/**
 * Translates ZWO workout files between XML text and the ride player's interval/step objects. XML is
 * structured text with named tags and attributes, like <SteadyState Duration="60" Power="0.65"/>.
 * Durations are seconds, cycling powers are FTP fractions and cadence is rpm. Most factory
 * functions return the same read/write/conversion interface for a different tag. This player parser
 * is separate from the Coach's stricter template-eligibility checks.
 */

import { equals, existance, exists,
         empty, first, last, repeat,
         capitalize, toFixed } from '../functions.js';

/**
 * Read a named setting from an XML element and apply its decoder, leaving an absent attribute
 * undefined rather than inventing a target.
 */
function readAttribute(args = {}) {
    const el       = args.el;
    const name     = args.name;
    const decode   = existance(args.decode, ((x) => x));

    if(el.hasAttribute(name)) {
        return decode(el.getAttribute(name));
    } else {
        return undefined;
    }
}

/**
 * Serialize one supplied attribute through its encoder. This formatter is not a general
 * XML-escaping function.
 */
function writeAttribute(args = {}) {
    const encode = existance(args.encode, ((x) => x));
    const name   = existance(args.name);
    const value  = existance(args.value);

    return `${name}="${encode(value)}"`;
}

/**
 * Create a reusable attribute reader/writer with a name and conversion functions, such as turning
 * Duration text into a number.
 */
function Attribute(args = {}) {
    const defaults = {
        name:      '',
        decode:    ((x) => x),
    };

    const name   = existance(args.name, defaults.name);
    const decode = existance(args.decode, defaults.decode);
    const encode = existance(args.encode, decode);

    function getName() {
        return name;
    }

    /** Read this configured attribute from an element using the shared missing-value behavior. */
    function read(args = {}) {
        const el = existance(args.el);
        return readAttribute({el, name, decode});
    }

    /** Write this configured attribute from a supplied value using its matching encoder. */
    function write(args = {}) {
        const value = existance(args.value);
        return writeAttribute({name, value, encode});
    }

    return Object.freeze({
        getName,
        read,
        write,
    });
}

/**
 * Copy selected, present attributes into a player step while renaming their keys. Filters separate
 * work/recovery settings from tag metadata.
 */
function attributesToStep(args = {}) {
    const tag    = existance(args.element);
    const filter = existance(args.filter, ((_) => true));
    const toName = existance(args.toName, ((x) => x));

    return Object.keys(tag).reduce(function(acc, key) {
        if(filter(key) && exists(tag[key])) {
            const name  = toName(key);
            const value = tag[key];
            acc[name] = value;
        }
        return acc;
    }, {});
}

/**
 * Convert a simple tag's attributes to lower-case step fields, excluding the element name and child
 * text messages.
 */
function Step(element) {
    const spec = {
        element: element,
        filter:  (key) => !equals(key, 'element') && !equals(key, 'children'),
        toName:  (key) => key.toLowerCase(),
    };

    return attributesToStep(spec);
}

/**
 * Extract the hard/work part of a repeated interval: OnDuration/OnPower become duration/power, with
 * the work cadence preserved.
 */
function OnStep(element) {
    const spec = {
        element:    element,
        filter: (key) => key.startsWith('On') || equals(key, 'Cadence'),
        toName: (key) => key.replace(/On/g,'').toLocaleLowerCase(),
    };

    return attributesToStep(spec);
}

/**
 * Extract the recovery part of a repeated interval, including CadenceResting as its cadence rather
 * than reusing the work target.
 */
function OffStep(element) {
    const spec = {
        element:    element,
        filter: (key) => key.startsWith('Off') || key.endsWith('Resting'),
        toName: (key) => key.replace(/On|Off|Resting/g,'').toLocaleLowerCase(),
    };

    return attributesToStep(spec);
}

function isTextEventTag(name) {
    return equals(String(name).toLowerCase(), 'textevent');
}

/**
 * Read direct child text-message tags for later placement on the workout timeline; messages are not
 * extra training intervals.
 */
function readTextEvents(el) {
    const nodes = el.children || [];
    const acc   = [];

    for(let i = 0; i < nodes.length; i++) {
        const child = nodes[i];
        if(isTextEventTag(child.tagName)) {
            acc.push(Elements.TextEvent.read({el: child}));
        }
    }

    return acc;
}

// timeoffset counts from the start of the whole block.
// offset counts from the start of the slice that block was cut into.
/**
 * Keep a message's optional display duration and replace its whole-block time offset with the
 * step-relative offset used by the player.
 */
function toMessage(event, offset) {
    const message = {};

    if(exists(event.duration)) message.duration = event.duration;
    message.offset  = offset;
    message.message = event.message;

    return message;
}

/**
 * Place each message into the timed step containing its offset, copying only steps that need
 * attached messages. End boundaries belong to the next step, not both.
 */
function assignMessages(intervals, children) {
    if(!exists(children) || empty(children)) return intervals;

    let cursor = 0;
    const acc  = [];

    for(let i = 0; i < intervals.length; i++) {
        const interval  = intervals[i];
        const steps     = interval.steps;
        const nextSteps = [];

        for(let s = 0; s < steps.length; s++) {
            const step = steps[s];

            if(!exists(step.duration)) {
                nextSteps.push(step);
                continue;
            }

            const start    = cursor;
            const end      = start + step.duration;
            const messages = [];

            for(let c = 0; c < children.length; c++) {
                const event      = children[c];
                const timeoffset = event.timeoffset;

                if(!equals(event.element, 'TextEvent')) continue;
                if(!exists(timeoffset)) continue;
                if(timeoffset < start || timeoffset >= end) continue;

                messages.push(toMessage(event, timeoffset - start));
            }

            cursor = end;

            if(empty(messages)) {
                nextSteps.push(step);
            } else {
                nextSteps.push(Object.assign({}, step, {messages}));
            }
        }

        acc.push(Object.assign({}, interval, {steps: nextSteps}));
    }

    return acc;
}

/**
 * Build the common interface for one XML tag. Default conversions handle a single steady step;
 * warm-ups, repeats and free riding supply their own conversions.
 */
function Element(args = {}) {
    const defaults = {
        name:     'Unknown',
        tagOpen:  '<Unknown',
        tagClose: ' />',
        content:  '',
    };

    const name         = existance(args.name, defaults.name);
    const tagOpen      = existance(args.tagOpen, defaults.tagOpen);
    const tagClose     = existance(args.tagClose, defaults.tagClose);
    const toInterval   = existance(args.toInterval, defaultToInterval);
    const fromInterval = existance(args.fromInterval, defaultFromInterval);
    const calcDuration = existance(args.calcDuration, defaultCalcDuration);

    function getName() {
        return name;
    }

    /**
     * Read plain text content, leaving missing or empty elements undefined so metadata defaults can
     * be applied later.
     */
    function readContent(el) {
        if(exists(el)) {
            let value = el.textContent;
            if(empty(value)) {
                return undefined;
            } else {
                return value;
            }
        }

        return undefined;
    }

    /**
     * Read the tag's attributes with registered decoders, retaining unknown attributes as text, and
     * collect child workout messages.
     */
    function read(args = {}) {
        const el            = existance(args.el);
        const attrsNodeList = el.attributes || [];
        const length        = attrsNodeList.length;

        let acc = {element: name};

        for(let i = 0; i < length; i++) {
            const name   = attrsNodeList[i].name;
            const attrFn = Attrs[name];
            const key    = name;
            let value    = attrsNodeList[i].value;

            if(exists(attrFn)) {
                value = attrFn.read({el});
            }

            acc[key] = value;
        }

        if(!equals(name, 'TextEvent')) {
            const children = readTextEvents(el);
            if(children.length > 0) {
                acc.children = children;
            }
        }

        return acc;
    }

    /**
     * Assemble this tag's opening text, attributes, content and closing text. Inputs are serialized
     * here, not validated as a complete workout.
     */
    function write(args = {}) {
        let { content, ...attributes } = args;

        content = existance(args.content, defaults.content);

        const attrsString = Object.keys(attributes).reduce((acc, key) => {
            acc += ` ${key}="${args[key]}"`;
            return acc;
        }, '');

        return `${tagOpen + attrsString}${content}${tagClose}`;
    }

    function defaultCalcDuration(element) {
        const duration = element.Duration;
        return duration;
    }

    /**
     * Wrap a simple converted step with its interval duration, giving the player its expected
     * nested shape.
     */
    function defaultToInterval(element) {
        const duration = calcDuration(element);
        const step = Step(element);

        return {
            duration: duration,
            steps:    [step],
        };
    }

    /**
     * Convert the first step of an interval back to a simple element with present power, cadence
     * and slope targets.
     */
    function defaultFromInterval(interval) {
        const res = {
            element: name,
            Duration: interval.duration,
        };
        const step = first(interval.steps);

        if(exists(step.power)) res.Power = step.power;
        if(exists(step.cadence)) res.Cadence = step.cadence;
        if(exists(step.slope)) res.Slope = step.slope;

        return res;
    }

    /** Combine reading an XML element with this tag's player conversion. */
    function readToInterval(args = {}) {
        return toInterval(read(args));
    }

    /**
     * Retain the legacy composition of the tag writer and reverse-conversion hook; the main file
     * writer uses the head/body conversion path below.
     */
    function writeFromInterval(args = {}) {
        return fromInterval(write(args));
    }

    return Object.freeze({
        getName,
        readContent,
        read,
        write,
        toInterval,
        fromInterval,
        calcDuration,
        defaultCalcDuration,
        defaultToInterval,
        readToInterval,
        defaultFromInterval,
        writeFromInterval,
    });
}

/**
 * Handle repeated work/recovery pairs, where Repeat counts complete pairs and On/Off attributes
 * describe each half.
 */
function IntervalsT(args = {}) {
    const spec = {
        name:         'IntervalsT',
        tagOpen:      '<IntervalsT',
        tagClose:     ' />',
        toInterval:   toInterval,
        calcDuration: calcDuration,
    };

    /**
     * Count the full seconds in all repetitions, including the recovery following each work
     * segment.
     */
    function calcDuration(element) {
        return element.Repeat * (element.OnDuration + element.OffDuration);
    }

    /**
     * Expand each repetition into a work interval and a recovery interval, then distribute text
     * messages across their combined timeline.
     */
    function toInterval(element) {
        const duration   = calcDuration(element);
        const stepsCount = existance(element.Repeat, 1);

        const onStep  = OnStep(element);
        const offStep = OffStep(element);
        const steps   = repeat(stepsCount)(function(acc) {
            acc.push({duration: onStep.duration, steps: [onStep]});
            acc.push({duration: offStep.duration, steps: [offStep]});
            return acc;
        })([]);

        return assignMessages(steps, element.children);
    }

    return Element(spec);
}

/**
 * Provide the existing fallback element interface for an unrecognized tag. This placeholder does
 * not mean the Coach accepts the tag for prescription.
 */
function Unknown(args = {}) {
    const spec = {
        name:     'Unknown',
        tagOpen:  '<Unknown',
        tagClose: ' />',
    };

    // console.warn(`Unknown Element in .zwo workout: ${args.el}`);

    return Element(spec);
}

/**
 * Handle free riding, optionally described by timed Sim slope pairs or distance-based Track slope
 * pairs rather than an ERG prescription.
 */
function FreeRide(args = {}) {
    const spec = {
        name:     'FreeRide',
        tagOpen:  '<FreeRide',
        tagClose: ' />',
        toInterval: toInterval,
    };

    /**
     * Expand slope/time or slope/distance pairs into steps. Fill remaining timed duration with flat
     * riding, or extend it if the supplied simulation runs longer; attach any timed messages.
     */
    function toInterval(element) {
        let duration   = existance(element.Duration, 1);
        const sim      = element.Sim;
        const track    = element.Track;
        const power    = 0;
        const slope    = 0;
        const steps    = [];

        let simDuration   = 0;
        let trackDistance = 0;

        if(exists(sim)) {
            for(let i=0; i< sim.length; i+=2) {
                simDuration += sim[i+1];
                steps.push({duration: sim[i+1], slope: sim[i], power});
            }
            if(simDuration < duration) {
                steps.push({duration: (duration - simDuration), slope, power});
            }
            if(simDuration > duration) {
                duration = simDuration;
            }
        } else if(exists(track)) {
            for(let i=0; i< track.length; i+=2) {
                trackDistance += track[i+1];
                steps.push({distance: track[i+1], slope: track[i], power});
            }
        } else {
            steps.push({duration, slope, power});
        }

        let interval = {};

        if(exists(track)) {
            interval = {distance: trackDistance, steps: steps};
        } else {
            interval = {
                duration: duration,
                steps: steps,
            };
        }

        return first(assignMessages([interval], element.children));
    }

    return Element(spec);
}

/**
 * Handle gradually changing power and optional cadence by dividing a block into small
 * constant-target steps, normally ten seconds each.
 */
function Warmup(args = {}) {
    const defaults = {
        timeDx: 10,
    };

    const timeDx = existance(args.timeDx, defaults.timeDx);

    const spec = Object.assign({
        name:         'Warmup',
        tagOpen:      '<Warmup',
        tagClose:     ' />',
        toInterval:   toInterval,
        fromInterval: fromInterval,
    }, args.spec);

    /**
     * Build successive power/cadence targets across the block and attach its messages to the
     * resulting steps. The legacy conversion uses whole timeDx-sized slices.
     */
    function toInterval(element) {
        const duration    = element.Duration;
        const powerLow    = element.PowerLow ?? element.Power;
        const powerHigh   = element.PowerHigh ?? element.Power;
        const cadence     = element.Cadence;
        const cadenceLow  = element.CadenceLow;
        const cadenceHigh = element.CadenceHigh;

        const stepsCount = parseInt(duration / timeDx);
        const powerDx    = (powerHigh - powerLow) / (stepsCount - 1);
        const cadenceDx  = (cadenceHigh - cadenceLow) / (stepsCount - 1);

        let steps       = [];
        let stepPower   = powerLow;
        let stepCadence = cadenceLow;

        for(let i = 0; i < stepsCount; i++) {
            if(exists(cadenceLow) && exists(cadenceHigh)) {
                steps.push({duration: timeDx, power: stepPower, cadence: Math.round(stepCadence),});
                stepCadence = (stepCadence + cadenceDx);
            } else if(exists(cadence)) {
                steps.push({duration: timeDx, power: stepPower, cadence,});
            } else {
                steps.push({duration: timeDx, power: stepPower});
            }
            stepPower = (stepPower + powerDx);
        }

        const fixedSteps = steps.map((step) => {
            step.power = toFixed(step.power, 2);
            return step;
        });

        return first(assignMessages([{
            duration: duration,
            steps: fixedSteps,
        }], element.children));
    }

    /** Summarize a ramp as its total duration and first/last power targets for file output. */
    function fromInterval(interval) {
        const res = {
            element:  spec.name,
            Duration: interval.duration,
        };
        const start = first(interval.steps);
        const end   = last(interval.steps);

        if(exists(start.power)) res.PowerLow = start.power;
        if(exists(end.power))   res.PowerHigh = end.power;

        return res;
    }

    return Element(spec);
}

/**
 * Handle the legacy cool-down ramp conversion, using the file's endpoint powers to generate
 * successive small steps.
 */
function Cooldown(args = {}) {
    const defaults = {
        timeDx: 10,
    };

    const timeDx = existance(args.timeDx, defaults.timeDx);

    const spec = {
        name:         'Cooldown',
        tagOpen:      '<Cooldown',
        tagClose:     ' />',
        toInterval:   toInterval,
        fromInterval: fromInterval,
    };

    /** Generate the cool-down's stepped power targets and distribute timed messages across them. */
    function toInterval(element) {
        const duration  = element.Duration;
        const powerLow  = element.PowerHigh;
        const powerHigh = element.PowerLow;

        const stepsCount = parseInt(duration / timeDx);
        const powerDx    = (powerHigh - powerLow) / (stepsCount - 1);

        let steps     = [];
        let stepPower = powerHigh;

        for(let i = 0; i < stepsCount; i++) {
            steps.push({duration: timeDx, power: stepPower});
            stepPower = (stepPower - powerDx);
        }

        const fixedSteps = steps.map((step) => {
            step.power = toFixed(step.power, 2);
            return step;
        });

        return first(assignMessages([{
            duration: duration,
            steps: fixedSteps,
        }], element.children));
    }

    /**
     * Write the interval's first and last powers as endpoint attributes, rather than serializing
     * each small internal step.
     */
    function fromInterval(interval) {
        const res = {
            element:  spec.name,
            Duration: interval.duration,
        };
        const start = first(interval.steps);
        const end   = last(interval.steps);

        if(exists(start.power)) res.PowerLow = start.power;
        if(exists(end.power))   res.PowerHigh  = end.power;

        return res;
    }

    return Element(spec);
}

/**
 * Reuse the warm-up conversion for a generic gradual change rather than duplicating ramp
 * mathematics.
 */
function Ramp(args = {}) {
    const spec = {
        name:       'Ramp',
        tagOpen:    '<Ramp',
        tagClose:   ' />',
    };

    return Warmup(spec);
}

/**
 * Handle a steady block, including files that supply a power or cadence range instead of one
 * explicit target.
 */
function SteadyState(args = {}) {

    const spec = Object.assign({
        name:         'SteadyState',
        tagOpen:      '<SteadyState',
        tagClose:     ' />',
        toInterval:   toInterval,
    }, args.spec);

    /**
     * Prefer an explicit target; otherwise average supplied range endpoints. With no power target,
     * use the existing zero-power/flat-slope representation, then attach messages.
     */
    function toInterval(element) {
        const duration  = element.Duration;
        const power     = element.Power;
        const powerLow  = element.PowerLow;
        const powerHigh = element.PowerHigh;
        const cadence     = element.Cadence;
        const cadenceLow  = element.CadenceLow;
        const cadenceHigh = element.CadenceHigh;

        if(!exists(cadence) && (exists(cadenceLow) || exists(cadenceHigh))) {
            const avgCadence = [cadenceLow, cadenceHigh]
                .filter(exists)
                .reduce((acc, x, _, { length }) => acc + x / length, 0);
            element.Cadence = Math.round(avgCadence);
            element.CadenceLow = undefined;
            element.CadenceHigh = undefined;
        }

        let step = {};

        if(exists(power)) {
            step = Step(element);
        }
        else if(exists(powerLow) || exists(powerHigh)) {
            element.Power = [powerLow, powerHigh]
                .filter(exists)
                .reduce((acc, x, _, { length }) => acc + x / length, 0);
            element.PowerLow = undefined;
            element.PowerHigh = undefined;
            step = Step(element);
        }
        else {
            element.Power = 0;
            element.Slope = 0;
            step = Step(element);
        }

        return first(assignMessages([{
            duration: duration,
            steps: [step],
        }], element.children));
    }

    return Element(spec);
}

/**
 * Read a workout instruction message without adding training time. Its empty interval list lets the
 * body converter omit it from the effort schedule.
 */
function TextEvent(args = {}) {

    const spec = Object.assign({
        name:       'TextEvent',
        tagOpen:    '<textevent',
        tagClose:   ' />',
        toInterval: toInterval,
    }, args.spec);

    // A TextEvent is not an effort, flatMap drops the empty list.
    function toInterval() {
        return [];
    }

    return Element(spec);
}

/**
 * Read metadata as text, returning undefined for missing/empty elements so the header can choose
 * its defaults.
 */
function readContent(el) {
    if(exists(el)) {
        let value = el.textContent;
        if(empty(value)) {
            return undefined;
        } else {
            return value;
        }
    }
    return undefined;
}

/**
 * Read and write descriptive workout metadata such as author, name and category, separate from the
 * actual effort sequence.
 */
function Head(args = {}) {
    const defaults = {
        author:      'Unknown',
        name:        'Custom',
        description: 'Custom',
        category:    'Custom',
        subcategory: '',
        sportType:   'bike',
        tags:        '',
    };

    /** Extract known metadata tags, supplying the established defaults only for missing values. */
    function read(args = {}) {
        const doc = existance(args.doc);

        const author      = readContent(doc.querySelector('author'));
        const name        = readContent(doc.querySelector('name'));
        const description = readContent(doc.querySelector('description'));
        const category    = readContent(doc.querySelector('category'));
        const subcategory = readContent(doc.querySelector('subcategory'));
        const sportType   = readContent(doc.querySelector('sportType'));
        const tags        = readContent(doc.querySelector('tags'));

        return {
            author:      existance(author, defaults.author),
            name:        existance(name, defaults.name),
            description: existance(description, defaults.description),
            category:    existance(category, defaults.category),
            subcategory: existance(subcategory, defaults.subcategory),
            sportType:   existance(sportType, defaults.sportType),
            tags:        existance(tags, defaults.tags),
        };
    }

    /**
     * Serialize the known metadata fields through their element writers, retaining a readable
     * indentation layout.
     */
    function write(args = {}) {
        const author      = existance(args.author, defaults.author);
        const name        = existance(args.name, defaults.name);
        const description = existance(args.description, defaults.description);
        const sportType   = existance(args.sportType, defaults.sportType);
        const category    = existance(args.category, defaults.category);
        const subcategory = existance(args.subcategory, defaults.subcategory);
        const tags        = existance(args.tags, defaults.tags);

        const elements = [
            Elements.Author.write({content: author}),
            Elements.Name.write({content: name}),
            Elements.Category.write({content: category}),
            Elements.SubCategory.write({content: subcategory}),
            Elements.Description.write({content: description}),
            Elements.SportType.write({content: sportType}),
            Elements.Tags.write({content: tags}),
        ];

        return elements.reduce((acc, el) => acc + el.padStart(el.length+4, ' ') + '\n', '\n');
    }

    /** Copy the player workout's metadata into the file-writer header shape. */
    function fromInterval(intervals) {
        return {
            author: intervals.meta.author,
            name: intervals.meta.name,
            category: intervals.meta.category,
            subcategory: intervals.meta.subcategory,
            sportType: intervals.meta.sportType,
            description: intervals.meta.description,
            tags: intervals.meta.tags,
        };
    }

    return Object.freeze({
        read,
        write,
        fromInterval,
    });
}

/**
 * Read, expand and write the training tags inside <workout>. It chooses the tag-specific handler
 * rather than putting all formats in one parser.
 */
function Body() {
    const defaults = {
        parent: 'workout',
    };

    const parent = defaults.parent;

    /**
     * Select the registered handler for an element and requested operation, treating text-message
     * tag names without case sensitivity.
     */
    function apply(el, method = 'read') {
        const name = el.tagName;

        if(isTextEventTag(name)) {
            return Elements.TextEvent[method]({el});
        }

        if(exists(Elements[name])) {
            return Elements[name][method]({el});
        }

        return Elements.Unknown[method]({el});
    }

    /**
     * Find the workout container's direct children. Header tags are outside this collection and do
     * not become ride steps.
     */
    function queryElements(doc) {
        const workoutEl = doc.querySelector(parent);
        const elements  = Array.from(workoutEl.children);
        return elements;
    }

    /**
     * Read each training tag into its element representation without expanding repetitions or ramps
     * into player steps.
     */
    function read(args = {}) {
        const doc = existance(args.doc);
        const elements = queryElements(doc);
        return elements.map((el) => apply(el, 'read'), []);
    }

    /**
     * Read and flatten each tag's player intervals; repeated pairs can produce several intervals
     * and text-only events produce none.
     */
    function readToInterval(args = {}) {
        const doc = existance(args.doc);
        const elements = queryElements(doc);
        return elements.flatMap((el) => apply(el, 'readToInterval'), []);
    }

    /**
     * Use the element's registered writer, or the existing unknown-tag writer, to generate one XML
     * row.
     */
    function writeElement(args = {}) {
        const { element, ...spec } = args;

        if(exists(Elements[element])) {
            return Elements[element].write(spec);
        }

        return Elements.Unknown.write(spec);
    }

    function isRamp(steps) {
        return steps.length > 1;
    }
    function isRampUp(steps) {
        return first(steps).power < last(steps).power;
    }
    function isRampDown(steps) {
        return first(steps).power > last(steps).power;
    }

    /**
     * Convert player intervals back into steady or rising/falling ramp elements using their step
     * count and endpoint powers. This is a simplified reverse conversion, not a lossless copy of
     * every original tag.
     */
    function fromInterval(value) {
        const intervals = value.intervals;
        const acc = [];

        for(var i = 0; i < intervals.length; i++) {
            var interval = intervals[i];
            var steps = intervals[i].steps;
            var node = {};

            if(isRamp(steps)) {
                if(isRampUp(steps)) {
                    node = Elements.Warmup.fromInterval(interval);
                } else
                if(isRampDown(steps)) {
                    node = Elements.Cooldown.fromInterval(interval);
                }
            } else {
                node = Elements.SteadyState.fromInterval(interval);
            }

            acc.push(node);
        }

        return acc;
    }

    /** Serialize the converted training elements with indentation, preserving their order. */
    function writeElements(elements) {
        return elements.reduce((acc, element) => {
            const row = writeElement(element);
            acc += row.padStart(row.length+8, ' ') + '\n';
            return acc;
        }, '');
    }

    /** Wrap the serialized training rows in the workout container. */
    function write(args = {}) {
        return `<workout>\n${writeElements(args)}    </workout>`;
    }

    return Object.freeze({
        read,
        readToInterval,
        fromInterval,
        write,
    });
}

function encodeSim(arr) {
    return arr.join(',');
}

/**
 * Read a comma-separated sequence of numeric slope/time or slope/distance values, omitting entries
 * that do not parse as numbers.
 */
function decodeSim(str) {
    return str.split(',').reduce((acc, x) => {
        const n = parseFloat(x);
        if(!isNaN(n)) acc.push(n);
        return acc;
    }, []);
}

/**
 * Attribute definitions select numeric/text/list conversion once for every tag using that field.
 * Similar names such as Cadence and CadenceResting deliberately remain distinct.
 */
const Attrs = {
    Duration:    Attribute({name: 'Duration', decode: parseInt}),
    OnDuration:  Attribute({name: 'OnDuration', decode: parseInt}),
    OffDuration: Attribute({name: 'OffDuration', decode: parseInt}),
    Power:     Attribute({name: 'Power', decode: parseFloat}),
    OnPower:   Attribute({name: 'OnPower', decode: parseFloat}),
    OffPower:  Attribute({name: 'OffPower', decode: parseFloat}),
    PowerLow:  Attribute({name: 'PowerLow', decode: parseFloat}),
    PowerHigh: Attribute({name: 'PowerHigh', decode: parseFloat}),

    Cadence:        Attribute({name: 'Cadence', decode: parseInt}),
    CadenceLow:     Attribute({name: 'CadenceLow', decode: parseInt}),
    CadenceHigh:    Attribute({name: 'CadenceHigh', decode: parseInt}),
    CadenceResting: Attribute({name: 'CadenceResting', decode: parseInt}),

    Slope:     Attribute({name: 'Slope', decode: parseFloat}),
    OnSlope:   Attribute({name: 'OnSlope', decode: parseFloat}),
    OffSlope:  Attribute({name: 'OffSlope', decode: parseFloat}),
    SlopeLow:  Attribute({name: 'SlopeLow', decode: parseFloat}),
    SlopeHigh: Attribute({name: 'SlopeHigh', decode: parseFloat}),

    Distance: Attribute({name: 'Distance', decode: parseInt}),

    Sim:   Attribute({name: 'Sim', decode: decodeSim, encode: encodeSim}),
    Track: Attribute({name: 'Track', decode: decodeSim, encode: encodeSim}),

    Repeat: Attribute({name: 'Repeat', decode: parseInt}),

    duration:   Attribute({name: 'duration', decode: parseInt}),
    timeoffset: Attribute({name: 'timeoffset', decode: parseInt}),
    message:    Attribute({name: 'message'}),

    TimeOffset: Attribute({name: 'TimeOffset', decode: parseInt}),
    Message:    Attribute({name: 'Message'}),
};

/**
 * This registry links XML tag names to their specialized handlers; metadata-only tags use the
 * common Element implementation.
 */
const Elements = {
    Warmup:      Warmup(),
    // SteadyState: Element({name: 'SteadyState', tagOpen: '<SteadyState', tagClose: ' />'}),
    SteadyState: SteadyState(),
    TextEvent:   TextEvent(),
    IntervalsT:  IntervalsT(),
    FreeRide:    FreeRide(),
    Ramp:        Ramp(),
    Cooldown:    Cooldown(),
    Unknown:     Unknown(),
    Author:      Element({name: 'author', tagOpen: '<author>', tagClose: '</author>'}),
    Name:        Element({name: 'name', tagOpen: '<name>', tagClose: '</name>'}),
    Category:    Element({name: 'category', tagOpen:  '<category>', tagClose: '</category>'}),
    SubCategory: Element({name: 'subcategory', tagOpen:  '<subcategory>', tagClose: '</subcategory>'}),
    Description: Element({name: 'description', tagOpen: '<description>', tagClose: '</description>'}),
    SportType:   Element({name: 'sporttype', tagOpen:  '<sporttype>', tagClose: '</sporttype>'}),
    Tags:        Element({name: 'tags', tagOpen: '<tags>', tagClose: '</tags>'}),
};

const head = Head();
const body = Body();

const parser    = new DOMParser();

/**
 * Parse the complete XML file into player metadata and intervals, adding a total duration from the
 * converted intervals.
 */
function readToInterval(zwo) {
    const doc       = parser.parseFromString(zwo, 'text/xml');
    const meta      = head.read({doc});
    const intervals = body.readToInterval({doc});
    const duration  = intervals.reduce((acc, i) => acc + i.duration, 0);

    return {
        meta:      Object.assign(meta, {duration}),
        intervals: intervals,
    };
}

/**
 * Parse the file into header/body element records without converting it to the player's interval
 * structure.
 */
function read(zwo) {
    const doc          = parser.parseFromString(zwo, 'text/xml');
    const headElements = head.read({doc});
    const bodyElements = body.read({doc});

    return {
        head: headElements,
        body: bodyElements,
    };
}

/**
 * Prepare a player workout for serialization by converting its metadata and interval body
 * separately.
 */
function fromInterval(intervals) {
    const res = {
        head: head.fromInterval(intervals),
        body: body.fromInterval(intervals),
    };

    return res;
}

/**
 * Combine the prepared header/body into ZWO XML text. The caller decides whether to save or
 * download that text.
 */
function write(args = {}) {
    const headElements = head.write(args.head);
    const bodyElements = body.write(args.body);

    return `<workout_file>${headElements}    ${bodyElements}\n</workout_file>`;
}

const zwo = {
    readAttribute,
    writeAttribute,
    Attribute,
    Attrs,
    Element,
    Elements,

    attributesToStep,
    Step,
    OnStep,
    OffStep,

    head,
    body,
    readToInterval,
    read,
    fromInterval,
    write,

};

export { zwo };

