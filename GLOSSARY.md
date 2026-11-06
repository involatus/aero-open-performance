# Aero Open Performance

An open-source tool that helps pilots calculate mass, balance, and takeoff and landing distances before a start, and keep or send a record of the calculation.

## Language

**Operator**:
A club, school or aircraft owner running their own copy of the tool.
_Avoid_: Tenant, customer

**Aircraft Data**:
The published mass and balance limits, loading stations, performance tables, factors and rules for one registered aircraft.
_Avoid_: Aircraft config, profile

**Configuration**:
A way an aircraft is equipped and operated that has its own weighing, such as with or without skis.
_Avoid_: Variant, setup

**Loading Station**:
A place in the aircraft where load is carried, with an arm and any limit on that load.
_Avoid_: Position, slot

**CG Envelope**:
The allowed combinations of mass and centre of gravity for an aircraft.
_Avoid_: CG range, balance limits

**Burn Plan**:
The assumed order in which fuel is used from the tanks during a flight, used to work out landing mass and centre of gravity.
_Avoid_: Fuel strategy, tank sequence

**Performance Step**:
One operation from the aircraft's manual in the chain that produces a distance, such as a table lookup or a wind correction.
_Avoid_: Formula, rule

**Data Owner**:
The person who decides and publishes Aircraft Data.
_Avoid_: Admin

**Data Release**:
A numbered, published version of Aircraft Data that pilots download for offline use.
_Avoid_: Update, data pack

**Calculation**:
The editable inputs and results for one planned start, saved on the pilot's device.
_Avoid_: Flight, scenario, tab

**Report**:
The record of one start's inputs, results and calculation steps.
_Avoid_: Form, template, performance sheet

**Prefilled Value**:
A value suggested by the tool that the pilot must check and may overwrite.
_Avoid_: Default, auto-filled value
