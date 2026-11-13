<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Wegbuch</title>
</svelte:head>

<!-- The two brush filters of the sketchbook look. They roughen shapes behind text, never the text. -->
<svg width="0" height="0" aria-hidden="true" style="position: absolute">
	<filter id="aquarell" color-interpolation-filters="sRGB" x="-10%" y="-10%" width="120%" height="120%">
		<feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed="7" result="n" />
		<feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G" />
	</filter>
	<!-- The small brush runs on thin wide shapes (buttons, chips). A percentage margin of the height is only a few pixels,
	     and Safari clips the displaced edge there. A tall margin keeps the whole shape inside the filter area. -->
	<filter id="pinsel" color-interpolation-filters="sRGB" x="-15%" y="-80%" width="130%" height="260%">
		<feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="3" result="n" />
		<feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" />
	</filter>
</svg>

{@render children()}
