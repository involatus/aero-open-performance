<script lang="ts">
	import { untrack } from 'svelte';
	import { BasicForm, createForm, type Schema } from '@sjsf/form';
	import { cleanForFormat } from '#lib/admin/form-schema.ts';
	import { resolver } from '@sjsf/form/resolvers/basic';
	import { translation } from '@sjsf/form/translations/en';
	import { createFormMerger } from '@sjsf/form/mergers/modern';
	import { createFormIdBuilder } from '@sjsf/form/id-builders/modern';
	import { createFormValidator } from '@sjsf/ajv8-validator';
	import { theme } from '@sjsf/basic-theme';
	import '@sjsf/basic-theme/css/basic.css';

	let { schema, read, write }: { schema: Schema; read: () => unknown; write: (value: unknown) => void } = $props();

	// The form edits its value in place, so it gets its own copy, and only real changes are passed up.
	// The parent rebuilds this component per section, so these are read once on purpose.
	// svelte-ignore state_referenced_locally
	let value = $state<any>(structuredClone($state.snapshot(read()) as object));
	const fingerprint = (v: unknown) => JSON.stringify(cleanForFormat($state.snapshot(v)));
	// svelte-ignore state_referenced_locally
	let last = fingerprint(value);

	// svelte-ignore state_referenced_locally
	const form = createForm<any>({
		theme, schema, resolver, translation,
		merger: createFormMerger,
		validator: createFormValidator,
		idBuilder: createFormIdBuilder,
		value: [() => value, (v) => { value = v; }],
		onSubmit: () => {}
	});

	$effect(() => {
		const now = fingerprint(value);
		if (now === last) return;
		last = now;
		untrack(() => write($state.snapshot(value)));
	});
</script>

<div class="aop-form">
	<BasicForm {form} novalidate />
</div>
