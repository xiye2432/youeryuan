import _defineProperty from '@babel/runtime/helpers/defineProperty';
import './style/index.scss.js';
import classNames from 'classnames';
import React from 'react';
import { omit, createForwardRefComponent } from '../../utils/index.js';

var Icon = function Icon(props) {
  var type = props.type,
    _props$className = props.className,
    className = _props$className === void 0 ? '' : _props$className,
    _props$size = props.size,
    size = _props$size === void 0 ? '23' : _props$size,
    color = props.color,
    forwardedRef = props.forwardedRef;
  if (type) type = type.replace(/_/g, '-');
  var cls = classNames(_defineProperty({}, "weui-icon-".concat(type), true), className);
  var style = {
    'font-size': size + 'px',
    color: color
  };
  return React.createElement("i", Object.assign({}, omit(props, ['type', 'className', 'forwardedRef']), {
    className: cls,
    style: style,
    ref: forwardedRef
  }));
};
var index = createForwardRefComponent(Icon);

export { index as default };
//# sourceMappingURL=index.js.map
