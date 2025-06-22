document.querySelectorAll('.searchBarContainer').forEach((container, index) => {
    // Create new select and input for each container
    const attributeSelect = document.createElement('select');
    attributeSelect.id = `attributeSelect-${index}`;
  
    const searchInput = document.createElement('input');
    searchInput.id = `searchInput-${index}`;
    searchInput.placeholder = 'Search...';
  
    // Append them to the container
    container.appendChild(attributeSelect);
    container.appendChild(searchInput);
  
    // Get the table associated with this search bar
    const table = container.nextElementSibling;
    if (!table || table.tagName !== 'TABLE') return;
  
    // Populate dropdown with column headers
    const headers = table.querySelectorAll('thead th');
    headers.forEach((th, i) => {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = th.textContent;
      attributeSelect.appendChild(option);
    });
  
    // Add input listener for searching
    searchInput.addEventListener('input', () => {
      const attrIndex = parseInt(attributeSelect.value);
      const searchValue = searchInput.value.toLowerCase();
      const rows = table.querySelectorAll('tbody tr');
  
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const cellText = cells[attrIndex]?.textContent.toLowerCase() || '';
        row.style.display = cellText.includes(searchValue) ? '' : 'none';
      });
    });
  
    // Optional: Reset rows when clicking table
    table.addEventListener('click', () => {
      searchInput.value = '';
      table.querySelectorAll('tbody tr').forEach(row => row.style.display = '');
    });
  });
  