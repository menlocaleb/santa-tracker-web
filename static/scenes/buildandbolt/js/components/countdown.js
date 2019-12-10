goog.provide('app.Countdown')

goog.require('Constants')

goog.require('app.LevelManager')

goog.require('app.shared.utils')

class Countdown {
  init(game, elem) {
    this.elem = elem
    this.game = game

    this.dom = {
      text: this.elem.querySelector('[data-walkthrough-text]'),
      toys: this.elem.querySelector('[data-walkthrough-toys]')
    }

    this.updateLevelAndShow()
  }

  show() {
    this.game.pause()
    this.elem.classList.remove('is-hidden')
    // To do: start countdown

    setTimeout(() => {
      // unfreeze game
      this.game.resume()
      this.hide()
    }, 3000)
  }

  hide() {
    this.elem.classList.add('is-hidden')
  }

  updateLevelAndShow() {
    const { toyType, toysCapacity } = app.LevelManager
    // update text
    this.dom.text.innerHTML = this.getMessage(toyType, toysCapacity)

    // update toys
    this.dom.toys.innerHTML = ''

    for (let i = 0; i < toyType.size; i++) {
      const domToypart = document.createElement('div')
      domToypart.classList.add('walkthrough__toypart')
      domToypart.classList.add('walkthrough__appear')

      const img = document.createElement('img')
      img.classList.add('walkthrough__toypart-img')
      img.src = `img/toys/${toyType.key}/${i + 1}.svg`

      const domOperator = document.createElement('div')
      domOperator.classList.add('walkthrough__operator')
      domOperator.classList.add('walkthrough__appear')
      domOperator.innerHTML = i === toyType.size - 1 ? '=' : '+'

      domToypart.appendChild(img)

      this.dom.toys.appendChild(domToypart)
      this.dom.toys.appendChild(domOperator)
    }

    const domToyfull = document.createElement('div')
    domToyfull.classList.add('walkthrough__toyfull')
    domToyfull.classList.add('walkthrough__appear')

    const img = document.createElement('img')
    img.classList.add('walkthrough__toyfull-img')
    img.src = `img/toys/${toyType.key}/full.svg`

    domToyfull.appendChild(img)

    this.dom.toys.appendChild(domToyfull)

    // wait level transition before showing the walkthrough
    setTimeout(() => {
      this.show()
    }, Constants.LEVEL_TRANSITION_TIMING)
  }

  getMessage(toyType, toysCapacity) {
    let message = ''

    if (toysCapacity > 1) {
      const msgId = `buildandbolt-build-${toyType.key}-multiple`
      const messageRaw = this.game._msg(msgId)
      message = messageRaw.replace('{{count}}', `<span class="walkthrough__number">${toysCapacity}</span>`)
    } else {
      const msgId = `buildandbolt-build-${toyType.key}-single`
      const messageRaw = this.game._msg(msgId)
      message = messageRaw.replace('1', `<span class="walkthrough__number">${toysCapacity}</span>`)
    }

    return message
  }
}

app.Countdown = new Countdown()