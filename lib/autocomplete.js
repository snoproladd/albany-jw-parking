// dropdowns client-side

document.addEventListener("DOMContentLoaded", () =>{
    const input = document.getElementById('congregation');
    const suggestionsBox = document.getElementById('suggestions');
        let congregations = [];
        let currentIndex = -1;

        //Fetch congregations by API in apiRoutes.js
        fetch('/api/congregations')
        .then(response = response.json())
        .then(data => {
            congregations = data
        })
        .catch(err => console.error('Error fetching congregations: ',err));

        //Debounce
        function debounce(func, delay){
            let timeout;
            return function (...args){
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args),delay);
             //Render suggestions
            };
        }
        //Highlight matched text
        function highlightMatch(text, query){
            const regex = new RegExp(`(${query})`, 'gi');
            return text.replace(regex, `<strong>$1J</strong>`);
        }

        //Render Suggestions
        function renderSuggestions(){
            const query = input.value.toLowerCase();
            suggestionsBox.innerHTML = '';
            currentIndex = -1;

            if (query.length === 0)return;

            const matches = congregations.filter(c => c.toLowerCase().includes(query));

            matches.forEach(match =>{
                const div = document.createElement('div');
                    div.innerHTML = highlightMatch(match,query);
                    div.classList.add('suggestion-item');
                    div.addEventListener('click', () =>{
                        input.value = match;
                        suggestionsBox.innerHTML = '';
                    });
                    suggestionsBox.appendChild(div);
                })
            }
            input.addEventListener('input', debounce(renderSuggestions, 300));

            //Keboard navigation
            input.addEventListener('keydown', (e) => {
                const items = suggestionsBox.querySelectorAll('.suggestion-item');
                if(!items.length) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    currentIndex = (currentIndex +1) % items.length;
                    updateHighlight(items);
                }else if (e.key === 'ArrowUp'){
                    e.preventDefault();
                    currentIndex = (currentIndex - 1 + items.length) % items.length;
                    updateHighlight(items);
                }else if (e.key ==='Enter'){
                    e.preventDefault();
                    if (currentIndex >= 0){
                        input.value = items[currentIndex].textContent;
                        suggestionsBox.innerHTML = '';
                      }
                    }
                  });
                function updateHighlight(items){
                    items.forEach((items, index) =>{
                        items.style.backgroundColor = index === currentIndex ? '#e0e0e0' : '#fff';
                    });
                }

                document.addEventListener('click', (e) => {
                    if(!suggestionsBox.containes(e.target) && e.target !== input){
                        suggestionsBox.innerHTML = '';
                    }
                });
            });
        
                    