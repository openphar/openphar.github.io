<script setup>
defineProps({ size: { type: Number, default: 28 } })
</script>

<template>
  <!-- Three converging circles: the ICH Q4 trio (JP / USP / Ph. Eur.)
       converging into one harmonized layer (brass). -->
  <svg :width="size" :height="size" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="13" cy="18" r="9" fill="#2E6B5E" fill-opacity="0.9"/>
    <circle cx="19" cy="18" r="9" fill="#7FA08F" fill-opacity="0.55" style="mix-blend-mode: multiply"/>
    <circle cx="16" cy="12" r="6.5" fill="#B08A3E" fill-opacity="0.85"/>
    <circle cx="16" cy="16.5" r="2" fill="#F3F4EE"/>
  </svg>
</template>
