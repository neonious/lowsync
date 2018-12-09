###################
Settings (show)
###################

Name
==================

lowsync-settings-show - Display settings of the device

Synopsis
==================

.. code-block:: bash

    lowsync settings show [<category>.<setting>..]

Description
==================

Displays the keys and values of one or more settings.

Options
==================

.. code-block:: bash

    <category>.<setting>..

The settings to display. Omit this option to display the value of all settings. Separate multiple keys with spaces.

Output
==================

Displays lines of *<key>=<value>* in alphabetical order.    

Values are printed in their JSON representation ( => strings are enclosed in double quotes).

Examples
==================

.. code-block:: bash

    lowsync settings show

Shows all settings and their corresponding values.