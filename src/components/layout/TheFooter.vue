<script setup>
</script>

<template>
  <footer class="bg-gray-800 text-white mt-auto">
    <div class="container mx-auto px-4 py-8">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <h3 class="text-lg font-semibold mb-4">Open Pharmacopoeia</h3>
          <p class="text-gray-400 text-sm">
            Unified knowledge graph for pharmacopoeia standards from multiple publishers.
          </p>
        </div>

        <div>
          <h4 class="font-semibold mb-3">Pharmacopoeias</h4>
          <ul class="space-y-2 text-sm text-gray-400">
            <li><RouterLink to="/pharmacopoeia/jp" class="hover:text-white">Japan (JP)</RouterLink></li>
            <li><RouterLink to="/pharmacopoeia/phint" class="hover:text-white">International (Ph.Int.)</RouterLink></li>
          </ul>
        </div>

        <div>
          <h4 class="font-semibold mb-3">Resources</h4>
          <ul class="space-y-2 text-sm text-gray-400">
            <li><RouterLink to="/api" class="hover:text-white">API Documentation</RouterLink></li>
            <li><a href="https://github.com/sipm/open-pharmacopoeia" class="hover:text-white">GitHub</a></li>
          </ul>
        </div>

        <div>
          <h4 class="font-semibold mb-3">License</h4>
          <p class="text-sm text-gray-400">
            Data is available under CC BY 4.0 license.
          </p>
        </div>
      </div>

      <div class="border-t border-gray-700 mt-8 pt-6 text-center text-sm text-gray-400">
        &copy; {{ new Date().getFullYear() }} Open Pharmacopoeia. All rights reserved.
      </div>
    </div>
  </footer>
</template>
