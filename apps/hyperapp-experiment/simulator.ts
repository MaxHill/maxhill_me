#!/usr/bin/env bun
import { type Action, type Effect, type Dispatchable } from 'hyperapp'
// @ts-ignore - hyperapp-render has type issues
import { renderToString } from 'hyperapp-render'
import { actions, view, type State, effecters } from "./src/app"

type EffectDescriptor = {
    name: string;
    params?: Record<string, any>;
    onSuccess?: string; 
    onError?: string;  
}
const effectRegistry = new WeakMap<Function, EffectDescriptor>();
export function registerEffect(fn: Function, descriptor: EffectDescriptor) {
    effectRegistry.set(fn, descriptor);
}

const knownEffecters = new WeakSet<Function>();
export function registerEffecter(fn: Function) {
    knownEffecters.add(fn);
}

function serializeEffectOptions(options: any): any {
    if (!options || typeof options !== 'object') {
        return options;
    }
    
    const serialized: any = {};
    for (const [key, value] of Object.entries(options)) {
        if (typeof value === 'function') {
            // This is an action reference - get its name
            serialized[key] = value.name || 'anonymous';
        } else if (typeof value === 'object' && value !== null) {
            serialized[key] = serializeEffectOptions(value);
        } else {
            serialized[key] = value;
        }
    }
    return serialized;
}

function getEffectDescriptor(effect: Effect<State>): EffectDescriptor | null {
    if (typeof effect === 'function') {
        // Check if this effect is registered
        const descriptor = effectRegistry.get(effect);
        if (descriptor) {
            return descriptor;
        }
        // Try to extract from function name
        return {
            name: effect.name || 'anonymous',
            params: {}
        };
    } else if (Array.isArray(effect)) {
        // [effecter, options] tuple
        const [effecter, options] = effect;
        const descriptor = effectRegistry.get(effecter);
        
        const effecterName = effecter.name || 'anonymous';
        const serializedOptions = serializeEffectOptions(options);
        
        if (descriptor) {
            return {
                ...descriptor,
                params: { ...(descriptor.params || {}), ...serializedOptions }
            };
        }
        
        return {
            name: effecterName,
            params: serializedOptions
        };
    }
    return null;
}

Object.values(effecters).forEach(registerEffecter);

if (import.meta.main) {
    const clientState = JSON.parse(process.argv[2]) as State;
    const action = JSON.parse(process.argv[3]) as { type: string };
    const params = JSON.parse(process.argv[4])

    const actionFn = (actions as Record<string, Action<State, unknown>>)[action.type];
    if (!actionFn) {
        throw new Error("no action called " + action.type + " exists")
    }

    const [state, pendingEffects] = applyAction(actionFn, clientState, params);
    
    // Convert effects to serializable descriptors
    const effectDescriptors = pendingEffects.map(getEffectDescriptor).filter(d => d !== null);
    
    const html = renderToString(view, state, actions)

    console.log(JSON.stringify({ state, pendingEffects: effectDescriptors, html }));
}

// Type guard to check if something is an action tuple [Action] or [Action, Payload]
function isActionTuple(effect: unknown): effect is readonly [Action<State, any>, any?] {
    if (!Array.isArray(effect)) return false;
    if (effect.length !== 1 && effect.length !== 2) return false;
    if (typeof effect[0] !== 'function') return false;
    
    // If it's a known effecter, it's NOT an action tuple
    if (knownEffecters.has(effect[0])) return false;
    
    // Check if the function name suggests it's an effecter
    const name = effect[0].name;
    if (name && (name.includes('Effect') || name.includes('effect') || name.includes('Effecter') || name.includes('effecter'))) {
        return false;
    }
    
    return true;
}

// Type guard to check if something is an effecter function
function isEffecter(effect: unknown): effect is (dispatch: any) => void {
    return typeof effect === 'function';
}

function applyAction<P>(
    actionFn: Action<State, P>, 
    currentState: State, 
    params: P
): [State, Effect<State>[]] {
    // Call the action and get the result
    const result: Dispatchable<State> = actionFn(currentState, params);

    // If result is just state (not an array), return it with no effects
    if (!Array.isArray(result)) {
        return [result, []];
    }

    // Result is [state, ...effects]
    const [newState, ...effectsList] = result as [State, ...any[]];

    let state: State = newState;
    let pendingEffects: Effect<State>[] = [];

    // Process each effect
    for (const effect of effectsList) {
        // Skip falsy effects (null, undefined, false, 0, "")
        if (!effect) continue;

        if (isActionTuple(effect)) {
            // Synchronous action tuple [Action] or [Action, Payload] - execute it recursively
            const [nextAction, nextPayload] = effect;
            const [nextState, nextEffects] = applyAction(nextAction, state, nextPayload ?? undefined);
            state = nextState;
            pendingEffects.push(...nextEffects);
        } else if (isEffecter(effect)) {
            // Side effect function - collect as pending
            pendingEffects.push(effect);
        }
        // Note: We could also have [effecter, options] tuples, but those are also side effects
        else if (Array.isArray(effect) && typeof effect[0] === 'function') {
            // This is an [effecter, options] tuple - also a side effect
            pendingEffects.push(effect as Effect<State>);
        }
    }

    return [state, pendingEffects];
}
