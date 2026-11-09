<script lang="ts" module>
	export type Tone = 'ok' | 'todo' | 'over';
	const TONES: Record<Tone, string> = { ok: 'bg-good-bg text-good', todo: 'bg-amber-bg text-amber', over: 'bg-bad-bg text-bad' };
</script>

<script lang="ts">
	let { tone, text }: { tone: Tone; text: string } = $props();
</script>

<i class={['flex-none rounded-[5px] px-[7px] py-0.5 text-[11px] font-bold not-italic tracking-[0.04em]', TONES[tone]]}>{text}</i>
