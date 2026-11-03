<script setup>
import { computed, onMounted, ref } from 'vue'
import { detailAccess } from '../lib/comparison-contract.js'

const props = defineProps({ publisher: String, entryId: String, edition: String, substanceId: String, rights: String, initialRecords: Array, publication: Object })
const records = ref(props.initialRecords || [])
const selectedEdition = ref(props.edition)
const status = ref('Edition pairs matched to this registry substance and current entry.')
const access = computed(() => detailAccess(props.publisher, props.rights))
const editions = computed(() => [...new Set([props.edition, ...records.value.flatMap(r => [r.from.edition, r.to.edition])])])
const selectedRecord = computed(() => records.value.find(r => [r.from.edition, r.to.edition].includes(selectedEdition.value) &&
  [r.from.edition, r.to.edition].includes(props.edition) && selectedEdition.value !== props.edition))
const verified = computed(() => selectedRecord.value?.status === 'verified')
function selectEdition() {
  const url = new URL(window.location.href)
  if (selectedEdition.value === props.edition) url.searchParams.delete('edition')
  else url.searchParams.set('edition', selectedEdition.value)
  history.replaceState(null, '', url)
  status.value = selectedEdition.value === props.edition ? 'Current edition selected.' :
    `Selected ${selectedEdition.value}. ${verified.value ? 'Documented changes shown below.' : 'Verified changes are unavailable for this selection.'}`
}
onMounted(() => {
  const requested = new URLSearchParams(window.location.search).get('edition')
  if (requested && editions.value.includes(requested)) selectedEdition.value = requested
  if (requested) status.value = selectedRecord.value?.status === 'verified' ? 'Requested edition differences shown below.' : 'Requested edition differences are unverified or unavailable.'
})
</script>

<template>
  <section class="mt-8 rounded-xs border border-line bg-paper p-6" aria-labelledby="edition-changes-heading">
    <h2 id="edition-changes-heading" class="font-display text-xl font-semibold">Editions and changes</h2>
    <p class="mt-2 text-sm">The monograph above remains the current edition: {{ edition }}. Selecting another edition shows its documented changes, without replacing the current text.</p>
    <p role="status" aria-live="polite" aria-atomic="true" class="mt-2 text-sm">{{ status }}</p>
    <template v-if="access === 'eligible' && records.length">
      <label for="edition-selection" class="mt-4 block text-sm font-medium">Compare current edition with</label>
      <select id="edition-selection" v-model="selectedEdition" @change="selectEdition" class="mt-2 max-w-full rounded border border-line bg-paper px-3 py-2">
        <option v-for="value in editions" :key="value" :value="value">{{ value }}{{ value === edition ? ' (current)' : '' }}</option>
      </select>
      <div v-if="selectedRecord" class="mt-4">
        <h3 class="font-semibold">{{ selectedRecord.from.edition }} → {{ selectedRecord.to.edition }}</h3>
        <p v-if="!verified" role="status" class="mt-2">Unverified edition pair. Change details are withheld until identity and source verification are complete.</p>
        <template v-else>
          <p class="mt-2 text-sm">Evidence: {{ selectedRecord.evidence }}</p>
          <p v-if="selectedRecord.comparedFields" class="mt-2 text-sm">Supplied fields: {{ selectedRecord.comparedFields.join(', ') }}.</p>
          <div v-if="selectedRecord.changes.length" class="mt-3 overflow-x-auto" tabindex="0" role="region" aria-label="Edition changes table">
            <table class="w-full border-collapse text-left text-sm">
              <caption class="sr-only">Documented changes from {{ selectedRecord.from.edition }} to {{ selectedRecord.to.edition }}</caption>
              <thead><tr><th scope="col" class="border border-line p-3">Field</th><th scope="col" class="border border-line p-3">Before</th><th scope="col" class="border border-line p-3">After</th><th scope="col" class="border border-line p-3">Evidence</th></tr></thead>
              <tbody><tr v-for="(change, index) in selectedRecord.changes" :key="index">
                <th scope="row" class="border border-line p-3">{{ change.field }} ({{ change.kind }})</th>
                <td class="border border-line p-3 whitespace-pre-line">{{ change.before || 'Not present' }}</td>
                <td class="border border-line p-3 whitespace-pre-line">{{ change.after || 'Not present' }}</td>
                <td class="border border-line p-3">{{ change.evidence }}</td>
              </tr></tbody>
            </table>
          </div>
          <p v-else class="mt-2">No changes in supplied fields. See evidence for the comparison scope.</p>
        </template>
      </div>
      <p v-else class="mt-3 text-sm">Choose another available edition to inspect its differences.</p>
    </template>
    <div v-if="publication" class="mt-4 space-y-2 text-sm">
      <p>{{ publication.attribution }}</p><p>{{ publication.adaptation }}</p><p>{{ publication.endorsement }}</p>
      <a :href="publication.license" class="underline">Source license: CC BY-NC-SA 3.0 IGO</a>
    </div>
  </section>
</template>
