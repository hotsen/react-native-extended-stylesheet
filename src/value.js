/**
 * Calculates particular value
 */

import rem from './replacers/rem';
import vars from './replacers/vars';
import percent from './replacers/percent';
import operation from './replacers/operation';
import scale from './replacers/scale';

export default class Value {
  /**
   * Constructor
   *
   * @param {*} value
   * @param {String} prop
   * @param {Array} varsArr array of var sets to search into
   * @param {Object} [stack] stack of recursion calls when resolve variable
   */
  constructor(value, prop, varsArr = [], stack = []) {
    this.value = value;
    // output value
    this.outValue = null;
    // was value calculated (need rounding for numbers)
    this.isCalculated = false;
    this.prop = prop;
    this.varsArr = varsArr;
    this.stack = stack;
  }

  /**
   * Calculates value:
   * execute function, resolve var refs, convert string of (rem, percent) to pixels
   */
  calc() {
    if (typeof this.value === 'function') {
      this.value = this.value();
    }

    if (typeof this.value === 'string') {
      this.calcString();
    } else {
      this.proxyValue();
    }

    if (this.isFinal()) {
      this.applyScale();
      this.applyRound();
    }

    return this.outValue;
  }

  /**
   * Calculates string
   */
  calcString() {
    let actions = [
      this.tryCalcOperation,
      this.tryCalcVar,
      this.tryCalcPercent,
      this.tryCalcRem,
    ];
    let value = this.tryActions(actions, this.value);
    if (value !== null) {
      this.outValue = value;
      this.isCalculated = true;
    } else {
      this.proxyValue();
    }
  }

  /**
   * Applies array of calculations to value. Stops on the first calculation that returns not null.
   * @param {Array} actions
   * @param {String} str
   */
  tryActions(actions, str) {
    // todo: use for.. of after https://github.com/facebook/react-native/issues/4676
    for (let i = 0; i < actions.length; i++) {
      let val = actions[i].call(this, str);
      if (val !== null) {
        return val;
      }
    }
    return null;
  }

  tryCalcOperation(str) {
    let opInfo = operation.isOperation(str);
    if (opInfo) {
      opInfo.v1 = this.calcOperationValue(opInfo.v1);
      opInfo.v2 = this.calcOperationValue(opInfo.v2);
      return operation.exec(opInfo);
    } else {
      return null;
    }
  }

  calcOperationValue(str) {
    let actions = [
      this.tryCalcVar,
      this.tryCalcPercent,
      this.tryCalcRem,
      this.tryCalcFloat,
    ];
    let value = this.tryActions(actions, str);
    if (value !== null) {
      return value;
    } else {
      throw new Error('Operations allowed only with numbers, rems and percents. You are trying: ' + str);
    }
  }

  tryCalcVar(str) {
    if (vars.isVar(str)) {
      let val = vars.calc(str, this.varsArr);
      if (this.stack.indexOf(str) >= 0) {
        throw new Error('Cyclic reference: ' + this.stack.concat([str]).join(' -> '));
      }
      let stack = this.stack.concat([str]);
      // recursion
      return new Value(val, str, this.varsArr, stack).calc();
    } else {
      return null;
    }
  }

  /**
   * Tries calc percent
   */
  tryCalcPercent(str) {
    if (percent.isPercent(str)) {
      return percent.calc(str, this.prop);
    }
    return null;
  }

  /**
   * Tries calc rem
   */
  tryCalcRem(str) {
    if (rem.isRem(str)) {
      let remValue = vars.get('$rem', this.varsArr);
      return rem.calc(str, remValue);
    } else {
      return null;
    }
  }

  tryCalcFloat(str) {
    let val = parseFloat(str);
    return !isNaN(val) ? val : null;
  }

  isFinal() {
    return !this.stack.length;
  }

  proxyValue() {
    this.outValue = this.value;
  }

  applyScale() {
    // do not apply scale to variables
    if (vars.isVar(this.prop)) {
      return;
    }
    let scaleValue = vars.get('$scale', this.varsArr) || 1;
    if (scaleValue === 1) {
      return;
    }
    if (scale.isScalable(this.outValue, this.prop)) {
      this.outValue = scale.calc(this.outValue, scaleValue);
      this.isCalculated = true;
    }
  }

  applyRound() {
    if (this.isCalculated && typeof this.outValue === 'number') {
      this.outValue = Math.round(this.outValue);
    }
  }
}
