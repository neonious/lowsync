###################
Settings (show)
###################

Name
==================

lowrmt-settings-show - Display settings of the device

Synopsis
==================

.. code-block:: bash

    lowrmt settings show [keys..]

Description
==================

Displays the keys and values of one or more settings.

Options
==================

.. code-block:: bash

    keys..

The settings to display. Omit this option to display the value of all settings. Separate multiple keys with spaces.

Output
==================

Displays lines of *<key>=<value>* in alphabetical order.    

Values are printed in their JSON representation ( => strings are enclosed in double quotes).

Examples
==================

.. code-block:: bash

    lowrmt settings show

Shows all settings and their corresponding values.